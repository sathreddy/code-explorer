import { describe, expect, test } from "bun:test";
import {
  type LLMProvider,
  type LLMMessage,
  type LLMToolDefinition,
  type LLMResponse,
  createProvider,
  getModelInfo,
  type ModelInfo,
} from "../src/llm/provider";

const EXPLORATION_TOOLS: LLMToolDefinition[] = [
  {
    name: "tree",
    description: "Get a directory tree",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path" },
      },
      required: ["path"],
    },
  },
  {
    name: "read",
    description: "Read a file",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path" },
      },
      required: ["path"],
    },
  },
];

describe("getModelInfo", () => {
  test("resolves gemini alias to full model", () => {
    const info = getModelInfo("flash");
    expect(info.provider).toBe("gemini");
    expect(info.modelId).toBe("gemini-3-flash-preview");
    expect(info.inputCostPer1M).toBeGreaterThan(0);
    expect(info.outputCostPer1M).toBeGreaterThan(0);
  });

  test("resolves sonnet alias", () => {
    const info = getModelInfo("sonnet");
    expect(info.provider).toBe("anthropic");
    expect(info.modelId).toBe("claude-sonnet-4-6");
  });

  test("resolves haiku alias", () => {
    const info = getModelInfo("haiku");
    expect(info.provider).toBe("anthropic");
    expect(info.modelId).toBe("claude-haiku-4-5-20251001");
  });

  test("resolves gpt5 alias", () => {
    const info = getModelInfo("gpt5");
    expect(info.provider).toBe("openai");
    expect(info.modelId).toBe("gpt-5.4-mini");
  });

  test("resolves gpt5-full alias", () => {
    const info = getModelInfo("gpt5-full");
    expect(info.provider).toBe("openai");
    expect(info.modelId).toBe("gpt-5.4");
  });

  test("resolves deepseek alias", () => {
    const info = getModelInfo("deepseek");
    expect(info.provider).toBe("openrouter");
    expect(info.modelId).toBe("deepseek/deepseek-v3.2");
  });

  test("treats full model IDs as passthrough for known providers", () => {
    const info = getModelInfo("gemini-2.5-flash");
    expect(info.provider).toBe("gemini");
    expect(info.modelId).toBe("gemini-2.5-flash");
  });

  test("treats claude- prefix as anthropic", () => {
    const info = getModelInfo("claude-opus-4-6");
    expect(info.provider).toBe("anthropic");
    expect(info.modelId).toBe("claude-opus-4-6");
  });

  test("treats gpt- prefix as openai", () => {
    const info = getModelInfo("gpt-5.4-nano");
    expect(info.provider).toBe("openai");
    expect(info.modelId).toBe("gpt-5.4-nano");
  });

  test("treats o4- prefix as openai", () => {
    const info = getModelInfo("o4-mini-2025-04-16");
    expect(info.provider).toBe("openai");
    expect(info.modelId).toBe("o4-mini-2025-04-16");
  });

  test("treats slash-containing IDs as openrouter", () => {
    const info = getModelInfo("mistralai/mistral-large-2512");
    expect(info.provider).toBe("openrouter");
    expect(info.modelId).toBe("mistralai/mistral-large-2512");
  });

  test("returns pricing for known aliases", () => {
    const flash = getModelInfo("flash");
    expect(flash.inputCostPer1M).toBe(0.5);
    expect(flash.outputCostPer1M).toBe(3.0);

    const sonnet = getModelInfo("sonnet");
    expect(sonnet.inputCostPer1M).toBe(3.0);
    expect(sonnet.outputCostPer1M).toBe(15.0);

    const haiku = getModelInfo("haiku");
    expect(haiku.inputCostPer1M).toBe(1.0);
    expect(haiku.outputCostPer1M).toBe(5.0);
  });
});

describe("createProvider", () => {
  test("creates gemini provider", () => {
    const provider = createProvider("gemini", "gemini-3-flash-preview");
    expect(provider).toBeDefined();
    expect(provider.name).toBe("gemini");
  });

  test("creates anthropic provider", () => {
    const provider = createProvider("anthropic", "claude-sonnet-4-6");
    expect(provider).toBeDefined();
    expect(provider.name).toBe("anthropic");
  });

  test("creates openai provider", () => {
    const provider = createProvider("openai", "gpt-5.4-mini");
    expect(provider).toBeDefined();
    expect(provider.name).toBe("openai");
  });

  test("creates openrouter provider", () => {
    const provider = createProvider("openrouter", "deepseek/deepseek-v3.2");
    expect(provider).toBeDefined();
    expect(provider.name).toBe("openrouter");
  });

  test("all providers implement getTools()", () => {
    const gemini = createProvider("gemini", "gemini-3-flash-preview");
    const anthropic = createProvider("anthropic", "claude-sonnet-4-6");
    const openai = createProvider("openai", "gpt-5.4-mini");
    const openrouter = createProvider("openrouter", "deepseek/deepseek-v3.2");

    for (const provider of [gemini, anthropic, openai, openrouter]) {
      const tools = provider.formatTools(EXPLORATION_TOOLS);
      expect(tools).toBeDefined();
      expect(Array.isArray(tools)).toBe(true);
    }
  });

  test("all providers implement formatMessages()", () => {
    const messages: LLMMessage[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there", toolCalls: [{ id: "1", name: "tree", args: { path: "src" } }] },
      { role: "tool", toolResults: [{ toolCallId: "1", content: "src/index.ts" }] },
    ];

    const gemini = createProvider("gemini", "gemini-3-flash-preview");
    const anthropic = createProvider("anthropic", "claude-sonnet-4-6");
    const openai = createProvider("openai", "gpt-5.4-mini");

    for (const provider of [gemini, anthropic, openai]) {
      const formatted = provider.formatMessages(messages);
      expect(formatted).toBeDefined();
      expect(Array.isArray(formatted)).toBe(true);
      expect(formatted.length).toBeGreaterThan(0);
    }
  });

  test("throws on unknown provider", () => {
    expect(() => createProvider("invalid" as any, "model")).toThrow();
  });
});
