import { describe, expect, test } from "bun:test";
import { join } from "path";
import {
  buildExplorationPrompt,
  buildSystemPrompt,
  type ExplorationMode,
} from "../src/prompts";

const FIXTURES = join(import.meta.dir, "fixtures");

describe("buildSystemPrompt", () => {
  test("includes base exploration strategy", () => {
    const prompt = buildSystemPrompt("architecture");
    expect(prompt).toContain("code exploration");
    expect(prompt).toContain("file:line");
  });

  test("architecture mode includes architecture-specific guidance", () => {
    const prompt = buildSystemPrompt("architecture");
    expect(prompt).toContain("architecture");
    expect(prompt).toContain("module");
    expect(prompt).toContain("dependency");
  });

  test("trace mode includes flow-tracing guidance", () => {
    const prompt = buildSystemPrompt("trace");
    expect(prompt).toContain("trace");
    expect(prompt).toContain("entry point");
  });

  test("onboard mode includes onboarding guidance", () => {
    const prompt = buildSystemPrompt("onboard");
    expect(prompt).toContain("new developer");
  });

  test("search mode includes targeted search guidance", () => {
    const prompt = buildSystemPrompt("search");
    expect(prompt).toContain("search");
    expect(prompt).toContain("pattern");
  });

  test("all modes require structured output format", () => {
    const modes: ExplorationMode[] = ["architecture", "trace", "onboard", "search"];
    for (const mode of modes) {
      const prompt = buildSystemPrompt(mode);
      expect(prompt).toContain("## Summary");
      expect(prompt).toContain("## Findings");
      expect(prompt).toContain("## Key Files");
      expect(prompt).toContain("## Confidence");
      expect(prompt).toContain("mermaid");
    }
  });

  test("all modes include tool descriptions", () => {
    const modes: ExplorationMode[] = ["architecture", "trace", "onboard", "search"];
    for (const mode of modes) {
      const prompt = buildSystemPrompt(mode);
      expect(prompt).toContain("tree");
      expect(prompt).toContain("read");
      expect(prompt).toContain("grep");
      expect(prompt).toContain("glob");
    }
  });
});

describe("buildExplorationPrompt", () => {
  test("includes question and tree", () => {
    const prompt = buildExplorationPrompt("How does auth work?", "src/\n  index.ts\n  auth.ts", undefined);
    expect(prompt).toContain("How does auth work?");
    expect(prompt).toContain("src/");
  });

  test("includes project context when provided", () => {
    const prompt = buildExplorationPrompt(
      "How does auth work?",
      "src/\n  index.ts",
      "This is a Node.js project written in TypeScript, named \"test-app\". Key dependencies: express, prisma.",
    );
    expect(prompt).toContain("Node.js");
    expect(prompt).toContain("express");
  });

  test("works without project context", () => {
    const prompt = buildExplorationPrompt("What does this do?", "src/\n  main.rs", undefined);
    expect(prompt).toContain("What does this do?");
    expect(prompt).not.toContain("Project Context");
  });
});
