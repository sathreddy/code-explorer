#!/usr/bin/env bun

import { Command } from "commander";
import chalk from "chalk";
import { writeFile } from "node:fs/promises";
import { join } from "path";
import { explore, formatStats, type ExplorerOptions } from "./explorer";
import { formatTerminalOutput, generateDiagramUrl, generateHtmlDiagram } from "./output";
import { getModelInfo } from "./llm/provider";
import type { ExplorationMode } from "./prompts";
import { startInteractiveMode } from "./interactive";

const VALID_MODES = ["architecture", "trace", "onboard", "search"] as const;
const VALID_DIAGRAMS = ["mermaid", "excalidraw", "html"] as const;

const program = new Command();

program
  .name("code-explorer")
  .description("Explore codebases and answer questions with file references using LLM-powered analysis")
  .version("2.0.0")
  .argument(
    "<source>",
    "Path to local directory or remote repo (github:owner/repo, gitlab:group/project, or git URL)",
  )
  .argument("<question>", "Question about the codebase")
  .option("-m, --model <model>", "LLM model or alias (flash, sonnet, haiku, gpt5, deepseek, or full model ID)", "flash")
  .option("--mode <mode>", "Exploration mode (architecture, trace, onboard, search)", "architecture")
  .option("-d, --max-depth <depth>", "Maximum tree depth", "6")
  .option("-e, --exclude <patterns...>", "Additional patterns to exclude")
  .option("-i, --include <patterns...>", "Additional patterns to include")
  .option("-b, --branch <branch>", "Branch/tag/commit for remote repos")
  .option("-v, --verbose", "Show exploration steps")
  .option("--diagram <target>", "Open diagram (mermaid, excalidraw, html)")
  .option("-s, --save [path]", "Save exploration as markdown file")
  .option("--json", "Output as JSON")
  .option("--interactive", "Enter interactive mode for follow-up questions")
  .action(async (source: string, question: string, opts) => {
    const mode = opts.mode as ExplorationMode;
    if (!VALID_MODES.includes(mode)) {
      console.error(chalk.red(`Invalid mode: ${mode}. Use: ${VALID_MODES.join(", ")}`));
      process.exit(1);
    }

    if (opts.diagram && !VALID_DIAGRAMS.includes(opts.diagram)) {
      console.error(chalk.red(`Invalid diagram target: ${opts.diagram}. Use: ${VALID_DIAGRAMS.join(", ")}`));
      process.exit(1);
    }

    const modelInfo = getModelInfo(opts.model);
    const requiredKeys: Record<string, string> = {
      gemini: "GEMINI_API_KEY",
      anthropic: "ANTHROPIC_API_KEY",
      openai: "OPENAI_API_KEY",
      openrouter: "OPENROUTER_API_KEY",
    };

    const envVar = requiredKeys[modelInfo.provider];
    if (envVar && !process.env[envVar]) {
      console.error(chalk.red(`${envVar} environment variable is required for ${modelInfo.provider} models`));
      process.exit(1);
    }

    try {
      const options: ExplorerOptions = {
        model: opts.model,
        mode,
        maxDepth: parseInt(opts.maxDepth, 10),
        extraExclusions: opts.exclude,
        extraInclusions: opts.include,
        branch: opts.branch,
        verbose: opts.verbose,
        diagram: opts.diagram,
        save: opts.save,
      };

      const result = await explore(source, question, options);

      if (opts.json) {
        console.log(JSON.stringify({ ...result.parsed, stats: result.stats }, null, 2));
      } else {
        console.log("\n" + formatTerminalOutput(result.parsed));
        console.log(formatStats(result.stats));
      }

      if (opts.diagram && result.parsed.diagrams.length > 0) {
        const diagram = result.parsed.diagrams[0]!;
        const target = opts.diagram as "mermaid" | "excalidraw" | "html";
        if (target === "html") {
          const html = generateHtmlDiagram(diagram);
          const htmlPath = join(process.cwd(), "code-explorer-diagram.html");
          await writeFile(htmlPath, html);
          console.log(chalk.green(`\nDiagram saved to ${htmlPath}`));
          const { $ } = await import("bun");
          await $`open ${htmlPath}`.quiet();
        } else {
          const url = generateDiagramUrl(diagram, target);
          console.log(chalk.green(`\nDiagram: ${url}`));
          if (target === "mermaid") {
            const { $ } = await import("bun");
            await $`open ${url}`.quiet();
          }
        }
      }

      if (opts.save) {
        const savePath = typeof opts.save === "string"
          ? opts.save
          : `${source.replace(/[^a-zA-Z0-9]/g, "-")}-exploration-${new Date().toISOString().slice(0, 10)}.md`;
        await writeFile(savePath, result.parsed.raw);
        console.log(chalk.green(`\nExploration saved to ${savePath}`));
      }

      if (opts.interactive) {
        await startInteractiveMode({
          model: opts.model,
          mode,
          systemPrompt: result.systemPrompt,
          tools: result.tools,
          provider: result.provider,
          messages: result.messages,
          lastResult: result.parsed,
          executeToolCalls: result.executeToolCalls,
        });
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

program.parse();
