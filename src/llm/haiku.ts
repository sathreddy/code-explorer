const ANTHROPIC_API = "https://api.anthropic.com/v1";
const MODEL = "claude-haiku-4-5-20250514";

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: string;
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, string>;
}

export interface HaikuMessage {
  role: "user" | "assistant";
  content:
    | string
    | (
        | { type: "text"; text: string }
        | {
            type: "tool_use";
            id: string;
            name: string;
            input: Record<string, string>;
          }
        | { type: "tool_result"; tool_use_id: string; content: string }
      )[];
}

export interface HaikuResponse {
  text?: string;
  toolCalls?: ToolCall[];
  done: boolean;
  stopReason?: string;
}

function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error("ANTHROPIC_API_KEY environment variable is required");
  }
  return key;
}

export function getExplorationTools(): ToolDefinition[] {
  return [
    {
      name: "tree",
      description:
        "Get a directory tree for a subdirectory. Use this to explore deeper into a specific folder.",
      input_schema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              "The relative path to the directory to explore (e.g., 'src/components')",
          },
        },
        required: ["path"],
      },
    },
    {
      name: "read",
      description:
        "Read the contents of a file. Use this to examine specific files you want to understand.",
      input_schema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The relative path to the file to read",
          },
          startLine: {
            type: "string",
            description: "Optional starting line number (1-indexed)",
          },
          endLine: {
            type: "string",
            description: "Optional ending line number",
          },
        },
        required: ["path"],
      },
    },
    {
      name: "grep",
      description:
        "Search for a pattern across all files in the codebase. Use this to find specific code patterns, function definitions, or usages.",
      input_schema: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "The regex pattern to search for",
          },
        },
        required: ["pattern"],
      },
    },
    {
      name: "glob",
      description:
        "Find files matching a glob pattern. Use this to locate files by name or extension.",
      input_schema: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description:
              "The glob pattern (e.g., '**/*.ts', 'src/**/*.test.js')",
          },
        },
        required: ["pattern"],
      },
    },
  ];
}

export async function chat(
  messages: HaikuMessage[],
  tools: ToolDefinition[],
  systemPrompt?: string,
): Promise<HaikuResponse> {
  const apiKey = getApiKey();

  const body: Record<string, unknown> = {
    model: MODEL,
    max_tokens: 8192,
    messages,
    tools,
  };

  if (systemPrompt) {
    body.system = systemPrompt;
  }

  const response = await fetch(`${ANTHROPIC_API}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as {
    content: (
      | { type: "text"; text: string }
      | {
          type: "tool_use";
          id: string;
          name: string;
          input: Record<string, string>;
        }
    )[];
    stop_reason: string;
  };

  const toolCalls: ToolCall[] = [];
  let text = "";

  for (const block of data.content) {
    if (block.type === "text") {
      text += block.text;
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        name: block.name,
        input: block.input,
      });
    }
  }

  return {
    text: text || undefined,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    done: data.stop_reason === "end_turn" || toolCalls.length === 0,
    stopReason: data.stop_reason,
  };
}

export function createUserMessage(text: string): HaikuMessage {
  return {
    role: "user",
    content: text,
  };
}

export function createAssistantMessage(
  text?: string,
  toolCalls?: ToolCall[],
): HaikuMessage {
  const content: HaikuMessage["content"] = [];

  if (text) {
    content.push({ type: "text", text });
  }

  if (toolCalls) {
    for (const call of toolCalls) {
      content.push({
        type: "tool_use",
        id: call.id,
        name: call.name,
        input: call.input,
      });
    }
  }

  return {
    role: "assistant",
    content,
  };
}

export function createToolResultMessage(
  results: { toolUseId: string; result: string }[],
): HaikuMessage {
  return {
    role: "user",
    content: results.map((r) => ({
      type: "tool_result" as const,
      tool_use_id: r.toolUseId,
      content: r.result,
    })),
  };
}
