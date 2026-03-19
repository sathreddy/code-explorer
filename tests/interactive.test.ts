import { describe, expect, test } from "bun:test";
import {
  parseReplCommand,
  type ReplCommand,
} from "../src/interactive";

describe("parseReplCommand", () => {
  test("parses /quit command", () => {
    const cmd = parseReplCommand("/quit");
    expect(cmd.type).toBe("quit");
  });

  test("parses /exit command", () => {
    const cmd = parseReplCommand("/exit");
    expect(cmd.type).toBe("quit");
  });

  test("parses /q shorthand", () => {
    const cmd = parseReplCommand("/q");
    expect(cmd.type).toBe("quit");
  });

  test("parses /save without path", () => {
    const cmd = parseReplCommand("/save");
    expect(cmd.type).toBe("save");
    expect(cmd.args).toBeUndefined();
  });

  test("parses /save with path", () => {
    const cmd = parseReplCommand("/save output.md");
    expect(cmd.type).toBe("save");
    expect(cmd.args).toBe("output.md");
  });

  test("parses /diagram without target", () => {
    const cmd = parseReplCommand("/diagram");
    expect(cmd.type).toBe("diagram");
    expect(cmd.args).toBeUndefined();
  });

  test("parses /diagram with target", () => {
    const cmd = parseReplCommand("/diagram mermaid");
    expect(cmd.type).toBe("diagram");
    expect(cmd.args).toBe("mermaid");
  });

  test("parses /mode command", () => {
    const cmd = parseReplCommand("/mode trace");
    expect(cmd.type).toBe("mode");
    expect(cmd.args).toBe("trace");
  });

  test("parses /help command", () => {
    const cmd = parseReplCommand("/help");
    expect(cmd.type).toBe("help");
  });

  test("parses regular question as query", () => {
    const cmd = parseReplCommand("How does the auth middleware work?");
    expect(cmd.type).toBe("query");
    expect(cmd.args).toBe("How does the auth middleware work?");
  });

  test("trims whitespace from input", () => {
    const cmd = parseReplCommand("  /quit  ");
    expect(cmd.type).toBe("quit");
  });

  test("treats empty input as empty query", () => {
    const cmd = parseReplCommand("");
    expect(cmd.type).toBe("empty");
  });

  test("treats whitespace-only input as empty", () => {
    const cmd = parseReplCommand("   ");
    expect(cmd.type).toBe("empty");
  });
});
