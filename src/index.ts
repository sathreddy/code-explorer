#!/usr/bin/env bun

import { Command } from "commander";
import chalk from "chalk";
import { explore, type ModelType } from "./explorer";

const program = new Command();

program
  .name("code-explorer")
  .description("Explore codebases and answer questions with file references")
  .version("1.0.0")
  .argument(
    "<source>",
    "Path to local directory or remote repo (github:owner/repo, gitlab:group/project, or git URL)",
  )
  .argument("<question>", "Question about the codebase")
  .option("-m, --model <model>", "LLM model to use (gemini or haiku)", "gemini")
  .option("-d, --max-depth <depth>", "Maximum tree depth", "6")
  .option("-e, --exclude <patterns...>", "Additional patterns to exclude")
  .option("-i, --include <patterns...>", "Additional patterns to include")
  .option("-b, --branch <branch>", "Branch/tag/commit for remote repos")
  .option("-v, --verbose", "Show exploration steps")
  .action(async (source: string, question: string, opts) => {
    const model = opts.model as ModelType;
    if (model !== "gemini" && model !== "haiku") {
      console.error(
        chalk.red(`Invalid model: ${model}. Use 'gemini' or 'haiku'.`),
      );
      process.exit(1);
    }

    if (model === "gemini" && !process.env.GEMINI_API_KEY) {
      console.error(
        chalk.red(
          "GEMINI_API_KEY environment variable is required for Gemini model",
        ),
      );
      process.exit(1);
    }

    if (model === "haiku" && !process.env.ANTHROPIC_API_KEY) {
      console.error(
        chalk.red(
          "ANTHROPIC_API_KEY environment variable is required for Haiku model",
        ),
      );
      process.exit(1);
    }

    try {
      const result = await explore(source, question, {
        model,
        maxDepth: parseInt(opts.maxDepth, 10),
        extraExclusions: opts.exclude,
        extraInclusions: opts.include,
        branch: opts.branch,
        verbose: opts.verbose,
      });

      console.log("\n" + chalk.bold("Answer:") + "\n");
      console.log(result);
    } catch (error) {
      console.error(
        chalk.red(
          `Error: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
      process.exit(1);
    }
  });

program.parse();
