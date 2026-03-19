export interface LLMToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

export interface LLMToolCall {
  id: string;
  name: string;
  args: Record<string, string>;
}

export interface LLMMessage {
  role: "user" | "assistant" | "tool";
  content?: string;
  toolCalls?: LLMToolCall[];
  toolResults?: { toolCallId: string; content: string }[];
}

export interface LLMResponse {
  text?: string;
  toolCalls?: LLMToolCall[];
  done: boolean;
  inputTokens?: number;
  outputTokens?: number;
}

export interface LLMProvider {
  name: string;
  modelId: string;
  chat(messages: unknown[], tools: unknown[], systemPrompt?: string): Promise<LLMResponse>;
  formatTools(tools: LLMToolDefinition[]): unknown[];
  formatMessages(messages: LLMMessage[]): unknown[];
}

export interface ModelInfo {
  provider: "gemini" | "anthropic" | "openai" | "openrouter";
  modelId: string;
  inputCostPer1M: number;
  outputCostPer1M: number;
}

interface ModelAlias {
  provider: ModelInfo["provider"];
  modelId: string;
  inputCostPer1M: number;
  outputCostPer1M: number;
}

const MODEL_ALIASES: Record<string, ModelAlias> = {
  flash: { provider: "gemini", modelId: "gemini-3-flash-preview", inputCostPer1M: 0.5, outputCostPer1M: 3.0 },
  sonnet: { provider: "anthropic", modelId: "claude-sonnet-4-6", inputCostPer1M: 3.0, outputCostPer1M: 15.0 },
  haiku: { provider: "anthropic", modelId: "claude-haiku-4-5-20251001", inputCostPer1M: 1.0, outputCostPer1M: 5.0 },
  gpt5: { provider: "openai", modelId: "gpt-5.4-mini", inputCostPer1M: 0.75, outputCostPer1M: 4.5 },
  "gpt5-full": { provider: "openai", modelId: "gpt-5.4", inputCostPer1M: 2.5, outputCostPer1M: 15.0 },
  deepseek: { provider: "openrouter", modelId: "deepseek/deepseek-v3.2", inputCostPer1M: 0.26, outputCostPer1M: 0.38 },
};

const KNOWN_PRICING: Record<string, { input: number; output: number }> = {
  "gemini-3-flash-preview": { input: 0.5, output: 3.0 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-2.5-pro": { input: 1.25, output: 10.0 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5-20251001": { input: 1.0, output: 5.0 },
  "claude-opus-4-6": { input: 15.0, output: 75.0 },
  "gpt-5.4-mini": { input: 0.75, output: 4.5 },
  "gpt-5.4": { input: 2.5, output: 15.0 },
  "gpt-5.4-nano": { input: 0.2, output: 1.25 },
  "deepseek/deepseek-v3.2": { input: 0.26, output: 0.38 },
};

function detectProvider(modelId: string): ModelInfo["provider"] {
  if (modelId.startsWith("gemini-")) return "gemini";
  if (modelId.startsWith("claude-")) return "anthropic";
  if (modelId.startsWith("gpt-") || modelId.startsWith("o4-") || modelId.startsWith("o3-")) return "openai";
  if (modelId.includes("/")) return "openrouter";
  return "openrouter";
}

export function getModelInfo(modelOrAlias: string): ModelInfo {
  const alias = MODEL_ALIASES[modelOrAlias];
  if (alias) {
    return {
      provider: alias.provider,
      modelId: alias.modelId,
      inputCostPer1M: alias.inputCostPer1M,
      outputCostPer1M: alias.outputCostPer1M,
    };
  }

  const provider = detectProvider(modelOrAlias);
  const pricing = KNOWN_PRICING[modelOrAlias];

  return {
    provider,
    modelId: modelOrAlias,
    inputCostPer1M: pricing?.input ?? 0,
    outputCostPer1M: pricing?.output ?? 0,
  };
}

class GeminiProvider implements LLMProvider {
  name = "gemini" as const;

  constructor(public modelId: string) {}

  formatTools(tools: LLMToolDefinition[]): unknown[] {
    return [
      {
        functionDeclarations: tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      },
    ];
  }

  formatMessages(messages: LLMMessage[]): unknown[] {
    return messages.map((msg) => {
      if (msg.role === "user") {
        return { role: "user", parts: [{ text: msg.content }] };
      }
      if (msg.role === "assistant") {
        const parts: unknown[] = [];
        if (msg.content) parts.push({ text: msg.content });
        if (msg.toolCalls) {
          for (const call of msg.toolCalls) {
            parts.push({ functionCall: { name: call.name, args: call.args } });
          }
        }
        return { role: "model", parts };
      }
      if (msg.role === "tool" && msg.toolResults) {
        return {
          role: "user",
          parts: msg.toolResults.map((r) => ({
            functionResponse: { name: r.toolCallId, response: { result: r.content } },
          })),
        };
      }
      return { role: "user", parts: [{ text: "" }] };
    });
  }

  async chat(messages: unknown[], tools: unknown[], systemPrompt?: string): Promise<LLMResponse> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is required");

    const body: Record<string, unknown> = {
      contents: messages,
      tools,
      toolConfig: { functionCallingConfig: { mode: "AUTO" } },
      generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
    };

    if (systemPrompt) {
      body.systemInstruction = { parts: [{ text: systemPrompt }] };
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.modelId}:generateContent?key=${apiKey}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as any;
    const candidate = data.candidates?.[0];
    if (!candidate?.content?.parts) throw new Error("Invalid Gemini response");

    const toolCalls: LLMToolCall[] = [];
    let text = "";

    for (const part of candidate.content.parts) {
      if (part.text) text += part.text;
      if (part.functionCall) {
        toolCalls.push({
          id: `gemini-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: part.functionCall.name,
          args: part.functionCall.args,
        });
      }
    }

    return {
      text: text || undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      done: toolCalls.length === 0,
      inputTokens: data.usageMetadata?.promptTokenCount,
      outputTokens: data.usageMetadata?.candidatesTokenCount,
    };
  }
}

class AnthropicProvider implements LLMProvider {
  name = "anthropic" as const;

  constructor(public modelId: string) {}

  formatTools(tools: LLMToolDefinition[]): unknown[] {
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
  }

  formatMessages(messages: LLMMessage[]): unknown[] {
    return messages.map((msg) => {
      if (msg.role === "user") {
        return { role: "user", content: msg.content };
      }
      if (msg.role === "assistant") {
        const content: unknown[] = [];
        if (msg.content) content.push({ type: "text", text: msg.content });
        if (msg.toolCalls) {
          for (const call of msg.toolCalls) {
            content.push({ type: "tool_use", id: call.id, name: call.name, input: call.args });
          }
        }
        return { role: "assistant", content };
      }
      if (msg.role === "tool" && msg.toolResults) {
        return {
          role: "user",
          content: msg.toolResults.map((r) => ({
            type: "tool_result",
            tool_use_id: r.toolCallId,
            content: r.content,
          })),
        };
      }
      return { role: "user", content: "" };
    });
  }

  async chat(messages: unknown[], tools: unknown[], systemPrompt?: string): Promise<LLMResponse> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required");

    const body: Record<string, unknown> = {
      model: this.modelId,
      max_tokens: 8192,
      messages,
      tools,
    };

    if (systemPrompt) body.system = systemPrompt;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
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

    const data = await response.json() as any;
    const toolCalls: LLMToolCall[] = [];
    let text = "";

    for (const block of data.content) {
      if (block.type === "text") text += block.text;
      if (block.type === "tool_use") {
        toolCalls.push({ id: block.id, name: block.name, args: block.input });
      }
    }

    return {
      text: text || undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      done: data.stop_reason === "end_turn" || toolCalls.length === 0,
      inputTokens: data.usage?.input_tokens,
      outputTokens: data.usage?.output_tokens,
    };
  }
}

class OpenAIProvider implements LLMProvider {
  name = "openai" as const;

  constructor(public modelId: string) {}

  formatTools(tools: LLMToolDefinition[]): unknown[] {
    return tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  formatMessages(messages: LLMMessage[]): unknown[] {
    return messages.map((msg) => {
      if (msg.role === "user") {
        return { role: "user", content: msg.content };
      }
      if (msg.role === "assistant") {
        const result: Record<string, unknown> = { role: "assistant" };
        if (msg.content) result.content = msg.content;
        if (msg.toolCalls) {
          result.tool_calls = msg.toolCalls.map((call) => ({
            id: call.id,
            type: "function",
            function: { name: call.name, arguments: JSON.stringify(call.args) },
          }));
        }
        return result;
      }
      if (msg.role === "tool" && msg.toolResults) {
        return msg.toolResults.map((r) => ({
          role: "tool",
          tool_call_id: r.toolCallId,
          content: r.content,
        }));
      }
      return { role: "user", content: "" };
    }).flat();
  }

  async chat(messages: unknown[], tools: unknown[], systemPrompt?: string): Promise<LLMResponse> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is required");

    const allMessages = systemPrompt
      ? [{ role: "system", content: systemPrompt }, ...messages as any[]]
      : messages;

    const body: Record<string, unknown> = {
      model: this.modelId,
      messages: allMessages,
      tools,
      temperature: 0.1,
      max_tokens: 8192,
    };

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as any;
    const choice = data.choices?.[0];
    const message = choice?.message;
    const toolCalls: LLMToolCall[] = [];

    if (message?.tool_calls) {
      for (const call of message.tool_calls) {
        toolCalls.push({
          id: call.id,
          name: call.function.name,
          args: JSON.parse(call.function.arguments),
        });
      }
    }

    return {
      text: message?.content || undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      done: toolCalls.length === 0,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    };
  }
}

class OpenRouterProvider implements LLMProvider {
  name = "openrouter" as const;

  constructor(public modelId: string) {}

  formatTools(tools: LLMToolDefinition[]): unknown[] {
    return tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  formatMessages(messages: LLMMessage[]): unknown[] {
    return messages.map((msg) => {
      if (msg.role === "user") {
        return { role: "user", content: msg.content };
      }
      if (msg.role === "assistant") {
        const result: Record<string, unknown> = { role: "assistant" };
        if (msg.content) result.content = msg.content;
        if (msg.toolCalls) {
          result.tool_calls = msg.toolCalls.map((call) => ({
            id: call.id,
            type: "function",
            function: { name: call.name, arguments: JSON.stringify(call.args) },
          }));
        }
        return result;
      }
      if (msg.role === "tool" && msg.toolResults) {
        return msg.toolResults.map((r) => ({
          role: "tool",
          tool_call_id: r.toolCallId,
          content: r.content,
        }));
      }
      return { role: "user", content: "" };
    }).flat();
  }

  async chat(messages: unknown[], tools: unknown[], systemPrompt?: string): Promise<LLMResponse> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY is required");

    const allMessages = systemPrompt
      ? [{ role: "system", content: systemPrompt }, ...messages as any[]]
      : messages;

    const body: Record<string, unknown> = {
      model: this.modelId,
      messages: allMessages,
      tools,
      temperature: 0.1,
      max_tokens: 8192,
    };

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as any;
    const choice = data.choices?.[0];
    const message = choice?.message;
    const toolCalls: LLMToolCall[] = [];

    if (message?.tool_calls) {
      for (const call of message.tool_calls) {
        toolCalls.push({
          id: call.id,
          name: call.function.name,
          args: JSON.parse(call.function.arguments),
        });
      }
    }

    return {
      text: message?.content || undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      done: toolCalls.length === 0,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    };
  }
}

export function createProvider(provider: ModelInfo["provider"], modelId: string): LLMProvider {
  switch (provider) {
    case "gemini":
      return new GeminiProvider(modelId);
    case "anthropic":
      return new AnthropicProvider(modelId);
    case "openai":
      return new OpenAIProvider(modelId);
    case "openrouter":
      return new OpenRouterProvider(modelId);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
