import { describe, expect, test } from "bun:test";
import { join } from "path";
import { detectProject, type ProjectInfo } from "../src/detect";

const FIXTURES = join(import.meta.dir, "fixtures");

describe("detectProject", () => {
  test("detects Node.js/TypeScript project", async () => {
    const info = await detectProject(join(FIXTURES, "node-project"));
    expect(info.type).toBe("node");
    expect(info.language).toBe("typescript");
    expect(info.name).toBe("test-node-app");
    expect(info.dependencies).toContain("express");
    expect(info.dependencies).toContain("prisma");
  });

  test("detects Python project", async () => {
    const info = await detectProject(join(FIXTURES, "python-project"));
    expect(info.type).toBe("python");
    expect(info.language).toBe("python");
    expect(info.name).toBe("test-python-app");
    expect(info.dependencies).toContain("flask");
    expect(info.dependencies).toContain("sqlalchemy");
  });

  test("detects Go project", async () => {
    const info = await detectProject(join(FIXTURES, "go-project"));
    expect(info.type).toBe("go");
    expect(info.language).toBe("go");
    expect(info.name).toBe("github.com/test/go-app");
    expect(info.dependencies).toContain("github.com/gin-gonic/gin");
  });

  test("detects Rust project", async () => {
    const info = await detectProject(join(FIXTURES, "rust-project"));
    expect(info.type).toBe("rust");
    expect(info.language).toBe("rust");
    expect(info.name).toBe("test-rust-app");
    expect(info.dependencies).toContain("tokio");
  });

  test("detects Rails project", async () => {
    const info = await detectProject(join(FIXTURES, "rails-project"));
    expect(info.type).toBe("rails");
    expect(info.language).toBe("ruby");
    expect(info.dependencies).toContain("rails");
  });

  test("detects React/Next.js project", async () => {
    const info = await detectProject(join(FIXTURES, "react-project"));
    expect(info.type).toBe("react");
    expect(info.framework).toBe("next");
    expect(info.language).toBe("javascript");
    expect(info.dependencies).toContain("next");
    expect(info.dependencies).toContain("react");
  });

  test("detects monorepo", async () => {
    const info = await detectProject(join(FIXTURES, "monorepo"));
    expect(info.type).toBe("monorepo");
    expect(info.monorepoTool).toBe("pnpm");
  });

  test("returns unknown for unrecognized project", async () => {
    const info = await detectProject(join(FIXTURES, "unknown-project"));
    expect(info.type).toBe("unknown");
    expect(info.dependencies).toEqual([]);
  });

  test("generates context string for LLM", async () => {
    const info = await detectProject(join(FIXTURES, "node-project"));
    expect(info.contextString).toContain("Node.js");
    expect(info.contextString).toContain("TypeScript");
    expect(info.contextString).toContain("express");
  });

  test("suggests exploration focus areas", async () => {
    const info = await detectProject(join(FIXTURES, "node-project"));
    expect(info.focusAreas.length).toBeGreaterThan(0);
    expect(info.focusAreas.some((f: string) => f.includes("package.json"))).toBe(true);
  });

  test("suggests exploration focus for Go projects", async () => {
    const info = await detectProject(join(FIXTURES, "go-project"));
    expect(info.focusAreas.some((f: string) => f.includes("cmd/"))).toBe(true);
  });

  test("suggests exploration focus for Rails projects", async () => {
    const info = await detectProject(join(FIXTURES, "rails-project"));
    expect(info.focusAreas.some((f: string) => f.includes("config/routes"))).toBe(true);
  });
});
