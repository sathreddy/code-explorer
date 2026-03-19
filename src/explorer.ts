import { join, resolve } from "path";
import chalk from "chalk";
import { createFilter, type FileFilter } from "./filter";
import { generateTree } from "./tools/tree";
import { readFile, formatReadResult } from "./tools/read";
import { grep, formatGrepResult } from "./tools/grep";
import { glob, formatGlobResult } from "./tools/glob";
import {
  parseGitHubUrl,
  buildGitHubTree,
  formatGitHubTree,
  getFileContent as getGitHubFile,
  getDefaultBranch as getGitHubDefaultBranch,
} from "./remote/github";
import {
  parseGitLabUrl,
  buildGitLabTree,
  formatGitLabTree,
  getFileContent as getGitLabFile,
  getDefaultBranch as getGitLabDefaultBranch,
} from "./remote/gitlab";
import { isGitUrl, shallowClone } from "./remote/clone";
import { getModelInfo, createProvider, type LLMProvider, type LLMMessage, type LLMToolCall, type LLMToolDefinition } from "./llm/provider";
import { detectProject } from "./detect";
import { buildSystemPrompt, buildExplorationPrompt, type ExplorationMode } from "./prompts";
import { parseStructuredOutput, type ExplorationResult } from "./output";

export interface ExplorerOptions {
  model: string;
  mode: ExplorationMode;
  maxDepth: number;
  extraExclusions?: string[];
  extraInclusions?: string[];
  branch?: string;
  verbose?: boolean;
  diagram?: "mermaid" | "excalidraw" | "html";
  save?: string;
  interactive?: boolean;
}

export interface ExplorationStats {
  duration: number;
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
  iterations: number;
  cost: number;
}

interface SourceContext {
  type: "local" | "github" | "gitlab" | "clone";
  basePath: string;
  filter?: FileFilter;
  cleanup?: () => Promise<void>;
  github?: { owner: string; repo: string; ref: string };
  gitlab?: { projectId: string; ref: string };
}

const TOOL_DEFINITIONS: LLMToolDefinition[] = [
  {
    name: "tree",
    description: "Get a directory tree for a subdirectory. Use this to explore deeper into a specific folder.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path to the directory (e.g., 'src/components')" },
      },
      required: ["path"],
    },
  },
  {
    name: "read",
    description: "Read file contents. Supports optional line ranges for large files.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path to the file" },
        startLine: { type: "string", description: "Starting line number (1-indexed)" },
        endLine: { type: "string", description: "Ending line number" },
      },
      required: ["path"],
    },
  },
  {
    name: "grep",
    description: "Search for a regex pattern across all files. Returns matching lines with file:line references.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regex pattern to search for" },
      },
      required: ["pattern"],
    },
  },
  {
    name: "glob",
    description: "Find files matching a glob pattern (e.g., '**/*.ts', 'src/**/*.test.js').",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Glob pattern to match files" },
      },
      required: ["pattern"],
    },
  },
];

async function createSourceContext(
  source: string,
  options: ExplorerOptions,
): Promise<SourceContext> {
  const githubInfo = parseGitHubUrl(source);
  if (githubInfo) {
    const ref =
      options.branch ||
      (githubInfo.ref === "HEAD"
        ? await getGitHubDefaultBranch(githubInfo.owner, githubInfo.repo)
        : githubInfo.ref);
    return {
      type: "github",
      basePath: githubInfo.path,
      github: { owner: githubInfo.owner, repo: githubInfo.repo, ref },
    };
  }

  const gitlabInfo = parseGitLabUrl(source);
  if (gitlabInfo) {
    const ref =
      options.branch ||
      (gitlabInfo.ref === "HEAD"
        ? await getGitLabDefaultBranch(gitlabInfo.projectId)
        : gitlabInfo.ref);
    return {
      type: "gitlab",
      basePath: gitlabInfo.path,
      gitlab: { projectId: gitlabInfo.projectId, ref },
    };
  }

  if (isGitUrl(source)) {
    const cloneResult = await shallowClone(source, options.branch);
    const filter = await createFilter(cloneResult.path, options.extraExclusions, options.extraInclusions);
    return { type: "clone", basePath: cloneResult.path, filter, cleanup: cloneResult.cleanup };
  }

  const resolvedPath = resolve(source);
  const filter = await createFilter(resolvedPath, options.extraExclusions, options.extraInclusions);
  return { type: "local", basePath: resolvedPath, filter };
}

async function getInitialTree(ctx: SourceContext, maxDepth: number): Promise<string> {
  if (ctx.type === "github" && ctx.github) {
    const tree = await buildGitHubTree(ctx.github.owner, ctx.github.repo, ctx.basePath, ctx.github.ref, maxDepth);
    return `📁 ${ctx.github.owner}/${ctx.github.repo}\n` + formatGitHubTree(tree);
  }
  if (ctx.type === "gitlab" && ctx.gitlab) {
    const tree = await buildGitLabTree(ctx.gitlab.projectId, ctx.basePath, ctx.gitlab.ref, maxDepth);
    return `📁 ${ctx.gitlab.projectId}\n` + formatGitLabTree(tree);
  }
  if (!ctx.filter) throw new Error("Filter required for local exploration");
  const { formatted } = await generateTree(ctx.basePath, { maxDepth, filter: ctx.filter });
  return formatted;
}

async function executeToolCall(
  ctx: SourceContext,
  toolName: string,
  args: Record<string, string>,
  maxDepth: number,
): Promise<string> {
  try {
    switch (toolName) {
      case "tree": {
        const subPath = args.path || "";
        if (ctx.type === "github" && ctx.github) {
          const fullPath = ctx.basePath ? `${ctx.basePath}/${subPath}` : subPath;
          const tree = await buildGitHubTree(ctx.github.owner, ctx.github.repo, fullPath, ctx.github.ref, maxDepth);
          return `📁 ${subPath}\n` + formatGitHubTree(tree);
        }
        if (ctx.type === "gitlab" && ctx.gitlab) {
          const fullPath = ctx.basePath ? `${ctx.basePath}/${subPath}` : subPath;
          const tree = await buildGitLabTree(ctx.gitlab.projectId, fullPath, ctx.gitlab.ref, maxDepth);
          return `📁 ${subPath}\n` + formatGitLabTree(tree);
        }
        if (!ctx.filter) throw new Error("Filter required");
        const fullPath = join(ctx.basePath, subPath);
        const { formatted } = await generateTree(fullPath, { maxDepth, filter: ctx.filter });
        return formatted;
      }
      case "read": {
        const filePath = args.path;
        if (!filePath) return "Error: path is required";
        const startLine = args.startLine ? parseInt(args.startLine, 10) : undefined;
        const endLine = args.endLine ? parseInt(args.endLine, 10) : undefined;

        if (ctx.type === "github" && ctx.github) {
          const fullPath = ctx.basePath ? `${ctx.basePath}/${filePath}` : filePath;
          const content = await getGitHubFile(ctx.github.owner, ctx.github.repo, fullPath, ctx.github.ref);
          const lines = content.split("\n");
          const start = startLine ? startLine - 1 : 0;
          const end = endLine ? endLine : lines.length;
          const selected = lines.slice(start, end);
          const formatted = selected.map((line, i) => `${(start + i + 1).toString().padStart(4)}│ ${line}`).join("\n");
          return `=== ${filePath} ===\nLines ${start + 1}-${end} of ${lines.length}\n\n${formatted}`;
        }
        if (ctx.type === "gitlab" && ctx.gitlab) {
          const fullPath = ctx.basePath ? `${ctx.basePath}/${filePath}` : filePath;
          const content = await getGitLabFile(ctx.gitlab.projectId, fullPath, ctx.gitlab.ref);
          const lines = content.split("\n");
          const start = startLine ? startLine - 1 : 0;
          const end = endLine ? endLine : lines.length;
          const selected = lines.slice(start, end);
          const formatted = selected.map((line, i) => `${(start + i + 1).toString().padStart(4)}│ ${line}`).join("\n");
          return `=== ${filePath} ===\nLines ${start + 1}-${end} of ${lines.length}\n\n${formatted}`;
        }
        const fullPath = join(ctx.basePath, filePath);
        const result = await readFile(fullPath, ctx.basePath, { startLine, endLine });
        return formatReadResult(result);
      }
      case "grep": {
        if (!args.pattern) return "Error: pattern is required";
        if (ctx.type === "github" || ctx.type === "gitlab") {
          return "Error: grep is not supported for remote repositories. Use glob to find files, then read specific files.";
        }
        if (!ctx.filter) throw new Error("Filter required");
        return formatGrepResult(await grep(ctx.basePath, args.pattern, ctx.filter));
      }
      case "glob": {
        if (!args.pattern) return "Error: pattern is required";
        if (ctx.type === "github" || ctx.type === "gitlab") {
          return "Error: glob is not supported for remote repositories. Use tree to explore the directory structure.";
        }
        if (!ctx.filter) throw new Error("Filter required");
        return formatGlobResult(await glob(ctx.basePath, args.pattern, ctx.filter));
      }
      default:
        return `Unknown tool: ${toolName}`;
    }
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function executeToolCallsParallel(
  ctx: SourceContext,
  toolCalls: LLMToolCall[],
  maxDepth: number,
  verbose: boolean,
): Promise<{ id: string; name: string; result: string }[]> {
  const promises = toolCalls.map(async (call) => {
    if (verbose) {
      console.log(chalk.cyan(`  ⚡ ${call.name}(${JSON.stringify(call.args)})`));
    }
    const result = await executeToolCall(ctx, call.name, call.args, maxDepth);
    if (verbose) {
      console.log(chalk.dim(`    → ${result.substring(0, 80)}...`));
    }
    return { id: call.id, name: call.name, result };
  });

  return Promise.all(promises);
}

async function runExploration(
  provider: LLMProvider,
  ctx: SourceContext,
  question: string,
  initialTree: string,
  projectContext: string | undefined,
  options: ExplorerOptions,
): Promise<{ text: string; stats: ExplorationStats }> {
  const startTime = Date.now();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalToolCalls = 0;

  const systemPrompt = buildSystemPrompt(options.mode);
  const userPrompt = buildExplorationPrompt(question, initialTree, projectContext);
  const tools = provider.formatTools(TOOL_DEFINITIONS);

  const messages: LLMMessage[] = [{ role: "user", content: userPrompt }];

  const maxIterations = 25;
  let iteration = 0;

  while (iteration < maxIterations) {
    iteration++;

    if (options.verbose) {
      console.log(chalk.dim(`\n[Iteration ${iteration}/${maxIterations}]`));
    }

    const formattedMessages = provider.formatMessages(messages);
    const response = await provider.chat(formattedMessages, tools, systemPrompt);

    totalInputTokens += response.inputTokens ?? 0;
    totalOutputTokens += response.outputTokens ?? 0;

    if (response.done || !response.toolCalls) {
      const modelInfo = getModelInfo(options.model);
      const cost =
        (totalInputTokens / 1_000_000) * modelInfo.inputCostPer1M +
        (totalOutputTokens / 1_000_000) * modelInfo.outputCostPer1M;

      return {
        text: response.text || "No response generated.",
        stats: {
          duration: Date.now() - startTime,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          toolCalls: totalToolCalls,
          iterations: iteration,
          cost,
        },
      };
    }

    messages.push({
      role: "assistant",
      content: response.text,
      toolCalls: response.toolCalls,
    });

    const results = await executeToolCallsParallel(ctx, response.toolCalls, options.maxDepth, options.verbose ?? false);
    totalToolCalls += results.length;

    messages.push({
      role: "tool",
      toolResults: results.map((r) => ({ toolCallId: r.id, content: r.result })),
    });
  }

  return {
    text: "Exploration reached maximum iterations. Try a more specific question.",
    stats: {
      duration: Date.now() - startTime,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      toolCalls: totalToolCalls,
      iterations: maxIterations,
      cost: 0,
    },
  };
}

export interface ExploreResult {
  parsed: ExplorationResult;
  stats: ExplorationStats;
  messages: LLMMessage[];
}

export async function explore(
  source: string,
  question: string,
  options: ExplorerOptions,
): Promise<ExploreResult> {
  const ctx = await createSourceContext(source, options);

  try {
    const modelInfo = getModelInfo(options.model);
    const provider = createProvider(modelInfo.provider, modelInfo.modelId);

    if (options.verbose) {
      console.log(chalk.blue(`Exploring: ${source}`));
      console.log(chalk.blue(`Model: ${modelInfo.modelId} (${modelInfo.provider})`));
      console.log(chalk.blue(`Mode: ${options.mode}`));
      console.log(chalk.dim("Detecting project type..."));
    }

    let projectContext: string | undefined;
    if (ctx.type === "local" || ctx.type === "clone") {
      const projectInfo = await detectProject(ctx.basePath);
      if (projectInfo.type !== "unknown") {
        projectContext = projectInfo.contextString;
        if (options.verbose) {
          console.log(chalk.green(`  Detected: ${projectInfo.type} (${projectInfo.language})`));
        }
      }
    }

    if (options.verbose) {
      console.log(chalk.dim("Generating initial tree..."));
    }

    const initialTree = await getInitialTree(ctx, options.maxDepth);

    if (options.verbose) {
      console.log(chalk.dim("Starting exploration..."));
    }

    const { text, stats } = await runExploration(provider, ctx, question, initialTree, projectContext, options);
    const parsed = parseStructuredOutput(text);

    return { parsed, stats, messages: [] };
  } finally {
    if (ctx.cleanup) {
      await ctx.cleanup();
    }
  }
}

export function formatStats(stats: ExplorationStats): string {
  const duration = (stats.duration / 1000).toFixed(1);
  const cost = stats.cost > 0 ? `$${stats.cost.toFixed(4)}` : "unknown";
  const lines = [
    chalk.dim(`\nExploration complete (${duration}s)`),
    chalk.dim(`  Tokens: ${stats.inputTokens.toLocaleString()} in / ${stats.outputTokens.toLocaleString()} out`),
    chalk.dim(`  Cost:   ~${cost}`),
    chalk.dim(`  Tools:  ${stats.toolCalls} calls in ${stats.iterations} iterations`),
  ];
  return lines.join("\n");
}
