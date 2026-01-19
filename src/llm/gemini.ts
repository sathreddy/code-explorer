const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta";
const MODEL = "gemini-2.0-flash";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

export interface ToolCall {
  name: string;
  args: Record<string, string>;
}

export interface GeminiMessage {
  role: "user" | "model";
  parts: (
    | { text: string }
    | { functionCall: { name: string; args: Record<string, string> } }
    | { functionResponse: { name: string; response: { result: string } } }
  )[];
}

export interface GeminiResponse {
  text?: string;
  toolCalls?: ToolCall[];
  done: boolean;
}

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY environment variable is required");
  }
  return key;
}

export function getExplorationTools(): ToolDefinition[] {
  return [
    {
      name: "tree",
      description:
        "Get a directory tree for a subdirectory. Use this to explore deeper into a specific folder.",
      parameters: {
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
      parameters: {
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
      parameters: {
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
      parameters: {
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
  messages: GeminiMessage[],
  tools: ToolDefinition[],
  systemInstruction?: string,
): Promise<GeminiResponse> {
  const apiKey = getApiKey();

  const functionDeclarations = tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));

  const body: Record<string, unknown> = {
    contents: messages,
    tools: [{ functionDeclarations }],
    toolConfig: {
      functionCallingConfig: {
        mode: "AUTO",
      },
    },
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8192,
    },
  };

  if (systemInstruction) {
    body.systemInstruction = {
      parts: [{ text: systemInstruction }],
    };
  }

  const response = await fetch(
    `${GEMINI_API}/models/${MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as {
    candidates?: {
      content?: {
        parts?: (
          | { text?: string }
          | { functionCall?: { name: string; args: Record<string, string> } }
        )[];
      };
      finishReason?: string;
    }[];
  };

  const candidate = data.candidates?.[0];
  if (!candidate?.content?.parts) {
    throw new Error("Invalid response from Gemini API");
  }

  const parts = candidate.content.parts;
  const toolCalls: ToolCall[] = [];
  let text = "";

  for (const part of parts) {
    if ("text" in part && part.text) {
      text += part.text;
    } else if ("functionCall" in part && part.functionCall) {
      toolCalls.push({
        name: part.functionCall.name,
        args: part.functionCall.args,
      });
    }
  }

  const done =
    toolCalls.length === 0 ||
    candidate.finishReason === "STOP" ||
    candidate.finishReason === "MAX_TOKENS";

  return {
    text: text || undefined,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    done: toolCalls.length === 0,
  };
}

export function createUserMessage(text: string): GeminiMessage {
  return {
    role: "user",
    parts: [{ text }],
  };
}

export function createModelMessage(
  text?: string,
  toolCalls?: ToolCall[],
): GeminiMessage {
  const parts: GeminiMessage["parts"] = [];

  if (text) {
    parts.push({ text });
  }

  if (toolCalls) {
    for (const call of toolCalls) {
      parts.push({
        functionCall: {
          name: call.name,
          args: call.args,
        },
      });
    }
  }

  return {
    role: "model",
    parts,
  };
}

export function createToolResultMessage(
  results: { name: string; result: string }[],
): GeminiMessage {
  return {
    role: "user",
    parts: results.map((r) => ({
      functionResponse: {
        name: r.name,
        response: { result: r.result },
      },
    })),
  };
}
