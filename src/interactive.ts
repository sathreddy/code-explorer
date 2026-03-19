import * as readline from "node:readline";
import chalk from "chalk";
import { writeFile } from "node:fs/promises";
import { join } from "path";
import { type LLMProvider, type LLMMessage, type LLMToolCall } from "./llm/provider";
import { buildSystemPrompt, type ExplorationMode } from "./prompts";
import {
  parseStructuredOutput,
  formatTerminalOutput,
  generateDiagramUrl,
  generateHtmlDiagram,
  type ExplorationResult,
} from "./output";

export interface ReplCommand {
  type: "quit" | "save" | "diagram" | "mode" | "help" | "query" | "empty";
  args?: string;
}

export function parseReplCommand(input: string): ReplCommand {
  const trimmed = input.trim();

  if (!trimmed) return { type: "empty" };

  if (trimmed.startsWith("/")) {
    const parts = trimmed.split(/\s+/, 2);
    const cmd = parts[0]!.toLowerCase();
    const args = trimmed.slice(parts[0]!.length).trim() || undefined;

    switch (cmd) {
      case "/quit":
      case "/exit":
      case "/q":
        return { type: "quit" };
      case "/save":
        return { type: "save", args };
      case "/diagram":
        return { type: "diagram", args };
      case "/mode":
        return { type: "mode", args };
      case "/help":
        return { type: "help" };
      default:
        return { type: "query", args: trimmed };
    }
  }

  return { type: "query", args: trimmed };
}

function printHelp(): void {
  console.log(chalk.bold("\nInteractive Commands:"));
  console.log("  /help              Show this help");
  console.log("  /mode <mode>       Switch exploration mode (architecture, trace, onboard, search)");
  console.log("  /diagram [target]  Open last diagram (mermaid, excalidraw, html)");
  console.log("  /save [path]       Save conversation as markdown");
  console.log("  /quit              Exit interactive mode");
  console.log("");
  console.log("  Or just type a follow-up question.\n");
}

interface InteractiveOptions {
  model: string;
  mode: ExplorationMode;
  systemPrompt: string;
  tools: unknown[];
  provider: LLMProvider;
  messages: LLMMessage[];
  lastResult?: ExplorationResult;
  executeToolCalls: (toolCalls: LLMToolCall[]) => Promise<{ id: string; name: string; result: string }[]>;
}

export async function startInteractiveMode(options: InteractiveOptions): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let currentMode = options.mode;
  let currentSystemPrompt = options.systemPrompt;
  let lastResult = options.lastResult;
  const messages = [...options.messages];
  const allResults: ExplorationResult[] = lastResult ? [lastResult] : [];

  console.log(chalk.bold.blue("\nInteractive mode — ask follow-up questions or type /help"));
  console.log(chalk.dim("Context from initial exploration is preserved.\n"));

  const prompt = (): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(chalk.green("? "), (answer) => {
        resolve(answer);
      });
    });
  };

  while (true) {
    const input = await prompt();
    const cmd = parseReplCommand(input);

    switch (cmd.type) {
      case "empty":
        continue;

      case "quit":
        console.log(chalk.dim("Goodbye."));
        rl.close();
        return;

      case "help":
        printHelp();
        continue;

      case "mode": {
        const validModes = ["architecture", "trace", "onboard", "search"];
        if (cmd.args && validModes.includes(cmd.args)) {
          currentMode = cmd.args as ExplorationMode;
          currentSystemPrompt = buildSystemPrompt(currentMode);
          console.log(chalk.green(`Switched to ${currentMode} mode.`));
        } else {
          console.log(chalk.yellow(`Invalid mode. Use: ${validModes.join(", ")}`));
        }
        continue;
      }

      case "diagram": {
        if (!lastResult || lastResult.diagrams.length === 0) {
          console.log(chalk.yellow("No diagrams available from the last response."));
          continue;
        }
        const diagram = lastResult.diagrams[0]!;
        const target = (cmd.args || "mermaid") as "mermaid" | "excalidraw" | "html";
        if (target === "html") {
          const html = generateHtmlDiagram(diagram);
          const htmlPath = join(process.cwd(), "code-explorer-diagram.html");
          await writeFile(htmlPath, html);
          console.log(chalk.green(`Diagram saved to ${htmlPath}`));
          const { $ } = await import("bun");
          await $`open ${htmlPath}`.quiet();
        } else {
          const url = generateDiagramUrl(diagram, target);
          console.log(chalk.green(`Diagram: ${url}`));
          if (target === "mermaid") {
            const { $ } = await import("bun");
            await $`open ${url}`.quiet();
          }
        }
        continue;
      }

      case "save": {
        const savePath = cmd.args || `exploration-${new Date().toISOString().slice(0, 10)}.md`;
        const content = allResults.map((r) => r.raw).join("\n\n---\n\n");
        await writeFile(savePath, content);
        console.log(chalk.green(`Saved ${allResults.length} exploration(s) to ${savePath}`));
        continue;
      }

      case "query": {
        if (!cmd.args) continue;

        messages.push({ role: "user", content: cmd.args });

        const maxIterations = 25;
        let iteration = 0;

        while (iteration < maxIterations) {
          iteration++;
          const formattedMessages = options.provider.formatMessages(messages);
          const response = await options.provider.chat(formattedMessages, options.tools, currentSystemPrompt);

          if (response.done || !response.toolCalls) {
            const text = response.text || "No response.";
            messages.push({ role: "assistant", content: text });
            const parsed = parseStructuredOutput(text);
            lastResult = parsed;
            allResults.push(parsed);
            console.log("\n" + formatTerminalOutput(parsed) + "\n");
            break;
          }

          messages.push({
            role: "assistant",
            content: response.text,
            toolCalls: response.toolCalls,
            _rawParts: response._rawParts,
          });

          const results = await options.executeToolCalls(response.toolCalls);

          messages.push({
            role: "tool",
            toolResults: results.map((r) => ({ toolCallId: r.id, content: r.result })),
          });
        }
        continue;
      }
    }
  }
}
