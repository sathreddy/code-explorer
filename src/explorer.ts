import { join, resolve, basename } from "path";
import chalk from "chalk";
import { createFilter, type FileFilter } from "./filter";
import { generateTree, formatTree } from "./tools/tree";
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
import { isGitUrl, shallowClone, extractRepoName } from "./remote/clone";
import * as gemini from "./llm/gemini";
import * as haiku from "./llm/haiku";

export type ModelType = "gemini" | "haiku";

export interface ExplorerOptions {
  model: ModelType;
  maxDepth: number;
  extraExclusions?: string[];
  extraInclusions?: string[];
  branch?: string;
  verbose?: boolean;
}

interface SourceContext {
  type: "local" | "github" | "gitlab" | "clone";
  basePath: string;
  filter?: FileFilter;
  cleanup?: () => Promise<void>;
  github?: { owner: string; repo: string; ref: string };
  gitlab?: { projectId: string; ref: string };
}

const SYSTEM_PROMPT = `You are a code exploration assistant. Your job is to explore a codebase and answer questions about it.

You have access to the following tools:
- tree: Get a directory tree for a subdirectory
- read: Read the contents of a file
- grep: Search for patterns across all files
- glob: Find files matching a pattern

Strategy:
1. First, analyze the initial directory tree to understand the project structure
2. Use the tools to explore areas relevant to the question
3. Be thorough - read relevant files, search for patterns, explore subdirectories
4. When you have enough information, provide a comprehensive answer

When answering:
- Reference specific files and line numbers in the format: file/path.ts:45 or file/path.ts:45-67
- Be specific and cite the code you found
- If you can't find an answer, explain what you searched and why you couldn't find it`;

async function createSourceContext(
  source: string,
  options: ExplorerOptions,
): Promise<SourceContext> {
  // Check for GitHub URL
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
      github: {
        owner: githubInfo.owner,
        repo: githubInfo.repo,
        ref,
      },
    };
  }

  // Check for GitLab URL
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
      gitlab: {
        projectId: gitlabInfo.projectId,
        ref,
      },
    };
  }

  // Check for generic git URL - clone to temp dir
  if (isGitUrl(source)) {
    const cloneResult = await shallowClone(source, options.branch);
    const filter = await createFilter(
      cloneResult.path,
      options.extraExclusions,
      options.extraInclusions,
    );
    return {
      type: "clone",
      basePath: cloneResult.path,
      filter,
      cleanup: cloneResult.cleanup,
    };
  }

  // Local directory
  const resolvedPath = resolve(source);
  const filter = await createFilter(
    resolvedPath,
    options.extraExclusions,
    options.extraInclusions,
  );
  return {
    type: "local",
    basePath: resolvedPath,
    filter,
  };
}

async function getInitialTree(
  ctx: SourceContext,
  maxDepth: number,
): Promise<string> {
  if (ctx.type === "github" && ctx.github) {
    const tree = await buildGitHubTree(
      ctx.github.owner,
      ctx.github.repo,
      ctx.basePath,
      ctx.github.ref,
      maxDepth,
    );
    const repoName = `${ctx.github.owner}/${ctx.github.repo}`;
    return `📁 ${repoName}\n` + formatGitHubTree(tree);
  }

  if (ctx.type === "gitlab" && ctx.gitlab) {
    const tree = await buildGitLabTree(
      ctx.gitlab.projectId,
      ctx.basePath,
      ctx.gitlab.ref,
      maxDepth,
    );
    return `📁 ${ctx.gitlab.projectId}\n` + formatGitLabTree(tree);
  }

  // Local or cloned
  if (!ctx.filter) {
    throw new Error("Filter required for local exploration");
  }
  const { formatted } = await generateTree(ctx.basePath, {
    maxDepth,
    filter: ctx.filter,
  });
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
          const fullPath = ctx.basePath
            ? `${ctx.basePath}/${subPath}`
            : subPath;
          const tree = await buildGitHubTree(
            ctx.github.owner,
            ctx.github.repo,
            fullPath,
            ctx.github.ref,
            maxDepth,
          );
          return `📁 ${subPath}\n` + formatGitHubTree(tree);
        }
        if (ctx.type === "gitlab" && ctx.gitlab) {
          const fullPath = ctx.basePath
            ? `${ctx.basePath}/${subPath}`
            : subPath;
          const tree = await buildGitLabTree(
            ctx.gitlab.projectId,
            fullPath,
            ctx.gitlab.ref,
            maxDepth,
          );
          return `📁 ${subPath}\n` + formatGitLabTree(tree);
        }
        if (!ctx.filter) throw new Error("Filter required");
        const fullPath = join(ctx.basePath, subPath);
        const { formatted } = await generateTree(fullPath, {
          maxDepth,
          filter: ctx.filter,
        });
        return formatted;
      }

      case "read": {
        const filePath = args.path;
        if (!filePath) return "Error: path is required";

        const startLine = args.startLine
          ? parseInt(args.startLine, 10)
          : undefined;
        const endLine = args.endLine ? parseInt(args.endLine, 10) : undefined;

        if (ctx.type === "github" && ctx.github) {
          const fullPath = ctx.basePath
            ? `${ctx.basePath}/${filePath}`
            : filePath;
          const content = await getGitHubFile(
            ctx.github.owner,
            ctx.github.repo,
            fullPath,
            ctx.github.ref,
          );
          const lines = content.split("\n");
          const start = startLine ? startLine - 1 : 0;
          const end = endLine ? endLine : lines.length;
          const selectedLines = lines.slice(start, end);
          const formatted = selectedLines
            .map(
              (line, i) => `${(start + i + 1).toString().padStart(4)}│ ${line}`,
            )
            .join("\n");
          return `=== ${filePath} ===\nLines ${start + 1}-${end} of ${lines.length}\n\n${formatted}`;
        }

        if (ctx.type === "gitlab" && ctx.gitlab) {
          const fullPath = ctx.basePath
            ? `${ctx.basePath}/${filePath}`
            : filePath;
          const content = await getGitLabFile(
            ctx.gitlab.projectId,
            fullPath,
            ctx.gitlab.ref,
          );
          const lines = content.split("\n");
          const start = startLine ? startLine - 1 : 0;
          const end = endLine ? endLine : lines.length;
          const selectedLines = lines.slice(start, end);
          const formatted = selectedLines
            .map(
              (line, i) => `${(start + i + 1).toString().padStart(4)}│ ${line}`,
            )
            .join("\n");
          return `=== ${filePath} ===\nLines ${start + 1}-${end} of ${lines.length}\n\n${formatted}`;
        }

        const fullPath = join(ctx.basePath, filePath);
        const result = await readFile(fullPath, ctx.basePath, {
          startLine,
          endLine,
        });
        return formatReadResult(result);
      }

      case "grep": {
        const pattern = args.pattern;
        if (!pattern) return "Error: pattern is required";

        if (ctx.type === "github" || ctx.type === "gitlab") {
          return "Error: grep is not supported for remote repositories (GitHub/GitLab API limitations). Try using glob to find files, then read specific files.";
        }

        if (!ctx.filter) throw new Error("Filter required");
        const result = await grep(ctx.basePath, pattern, ctx.filter);
        return formatGrepResult(result);
      }

      case "glob": {
        const pattern = args.pattern;
        if (!pattern) return "Error: pattern is required";

        if (ctx.type === "github" || ctx.type === "gitlab") {
          return "Error: glob is not supported for remote repositories (GitHub/GitLab API limitations). Use tree to explore the directory structure.";
        }

        if (!ctx.filter) throw new Error("Filter required");
        const result = await glob(ctx.basePath, pattern, ctx.filter);
        return formatGlobResult(result);
      }

      default:
        return `Unknown tool: ${toolName}`;
    }
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function runGeminiExploration(
  ctx: SourceContext,
  question: string,
  initialTree: string,
  options: ExplorerOptions,
): Promise<string> {
  const tools = gemini.getExplorationTools();
  const messages: gemini.GeminiMessage[] = [];

  const initialPrompt = `Here is the directory structure of the codebase:

${initialTree}

Question: ${question}

Please explore the codebase using the available tools and provide a comprehensive answer.`;

  messages.push(gemini.createUserMessage(initialPrompt));

  const maxIterations = 20;
  let iteration = 0;

  while (iteration < maxIterations) {
    iteration++;

    if (options.verbose) {
      console.log(chalk.dim(`\n[Iteration ${iteration}]`));
    }

    const response = await gemini.chat(messages, tools, SYSTEM_PROMPT);

    if (response.text && options.verbose) {
      console.log(chalk.dim(`Model: ${response.text.substring(0, 100)}...`));
    }

    if (response.done || !response.toolCalls) {
      return response.text || "No response generated";
    }

    messages.push(gemini.createModelMessage(response.text, response.toolCalls));

    const toolResults: { name: string; result: string }[] = [];
    for (const call of response.toolCalls) {
      if (options.verbose) {
        console.log(
          chalk.cyan(`  Tool: ${call.name}(${JSON.stringify(call.args)})`),
        );
      }

      const result = await executeToolCall(
        ctx,
        call.name,
        call.args,
        options.maxDepth,
      );
      toolResults.push({ name: call.name, result });

      if (options.verbose) {
        console.log(chalk.dim(`  Result: ${result.substring(0, 100)}...`));
      }
    }

    messages.push(gemini.createToolResultMessage(toolResults));
  }

  return "Exploration reached maximum iterations. Please try a more specific question.";
}

async function runHaikuExploration(
  ctx: SourceContext,
  question: string,
  initialTree: string,
  options: ExplorerOptions,
): Promise<string> {
  const tools = haiku.getExplorationTools();
  const messages: haiku.HaikuMessage[] = [];

  const initialPrompt = `Here is the directory structure of the codebase:

${initialTree}

Question: ${question}

Please explore the codebase using the available tools and provide a comprehensive answer.`;

  messages.push(haiku.createUserMessage(initialPrompt));

  const maxIterations = 20;
  let iteration = 0;

  while (iteration < maxIterations) {
    iteration++;

    if (options.verbose) {
      console.log(chalk.dim(`\n[Iteration ${iteration}]`));
    }

    const response = await haiku.chat(messages, tools, SYSTEM_PROMPT);

    if (response.text && options.verbose) {
      console.log(chalk.dim(`Model: ${response.text.substring(0, 100)}...`));
    }

    if (response.done || !response.toolCalls) {
      return response.text || "No response generated";
    }

    messages.push(
      haiku.createAssistantMessage(response.text, response.toolCalls),
    );

    const toolResults: { toolUseId: string; result: string }[] = [];
    for (const call of response.toolCalls) {
      if (options.verbose) {
        console.log(
          chalk.cyan(`  Tool: ${call.name}(${JSON.stringify(call.input)})`),
        );
      }

      const result = await executeToolCall(
        ctx,
        call.name,
        call.input,
        options.maxDepth,
      );
      toolResults.push({ toolUseId: call.id, result });

      if (options.verbose) {
        console.log(chalk.dim(`  Result: ${result.substring(0, 100)}...`));
      }
    }

    messages.push(haiku.createToolResultMessage(toolResults));
  }

  return "Exploration reached maximum iterations. Please try a more specific question.";
}

export async function explore(
  source: string,
  question: string,
  options: ExplorerOptions,
): Promise<string> {
  const ctx = await createSourceContext(source, options);

  try {
    if (options.verbose) {
      console.log(chalk.blue(`Exploring: ${source}`));
      console.log(chalk.blue(`Model: ${options.model}`));
      console.log(chalk.dim("Generating initial tree..."));
    }

    const initialTree = await getInitialTree(ctx, options.maxDepth);

    if (options.verbose) {
      console.log(chalk.dim("Starting exploration..."));
    }

    let result: string;
    if (options.model === "haiku") {
      result = await runHaikuExploration(ctx, question, initialTree, options);
    } else {
      result = await runGeminiExploration(ctx, question, initialTree, options);
    }

    return result;
  } finally {
    if (ctx.cleanup) {
      await ctx.cleanup();
    }
  }
}
