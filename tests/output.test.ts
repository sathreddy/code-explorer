import { describe, expect, test } from "bun:test";
import {
  parseStructuredOutput,
  extractMermaidBlocks,
  formatTerminalOutput,
  generateDiagramUrl,
  generateHtmlDiagram,
  type ExplorationResult,
} from "../src/output";

const SAMPLE_OUTPUT = `## Summary
This is a Node.js REST API built with Express and Prisma ORM.

## Findings
The application follows a layered architecture with controllers, services, and models.

### Entry Point
The main entry point is \`src/index.ts:1-15\` which sets up the Express server.

### Authentication
JWT-based auth is implemented in \`src/middleware/auth.ts:23-45\`.

## Diagram
\`\`\`mermaid
graph TD
  A[Router] --> B[Controller]
  B --> C[Service]
  C --> D[Prisma Client]
  D --> E[(Database)]
\`\`\`

## Key Files
| File | Purpose | Lines |
|------|---------|-------|
| src/index.ts | Express server setup | 1-15 |
| src/middleware/auth.ts | JWT authentication | 23-45 |
| src/services/user.ts | User CRUD operations | 1-89 |

## Confidence
High — all core modules were explored and the architecture is straightforward.`;

const MULTI_DIAGRAM_OUTPUT = `## Summary
Complex system.

## Diagram
\`\`\`mermaid
graph TD
  A --> B
\`\`\`

Another diagram:

\`\`\`mermaid
sequenceDiagram
  Client->>Server: Request
  Server->>DB: Query
\`\`\`

## Confidence
Medium`;

describe("parseStructuredOutput", () => {
  test("extracts summary section", () => {
    const result = parseStructuredOutput(SAMPLE_OUTPUT);
    expect(result.summary).toContain("Node.js REST API");
  });

  test("extracts findings section", () => {
    const result = parseStructuredOutput(SAMPLE_OUTPUT);
    expect(result.findings).toContain("layered architecture");
  });

  test("extracts key files table", () => {
    const result = parseStructuredOutput(SAMPLE_OUTPUT);
    expect(result.keyFiles.length).toBe(3);
    expect(result.keyFiles[0].file).toBe("src/index.ts");
    expect(result.keyFiles[0].purpose).toBe("Express server setup");
  });

  test("extracts confidence", () => {
    const result = parseStructuredOutput(SAMPLE_OUTPUT);
    expect(result.confidence).toBe("high");
  });

  test("extracts mermaid diagrams", () => {
    const result = parseStructuredOutput(SAMPLE_OUTPUT);
    expect(result.diagrams.length).toBe(1);
    expect(result.diagrams[0]).toContain("graph TD");
  });

  test("handles missing sections gracefully", () => {
    const result = parseStructuredOutput("Just some plain text without structure.");
    expect(result.summary).toBe("");
    expect(result.findings).toBe("Just some plain text without structure.");
    expect(result.keyFiles).toEqual([]);
    expect(result.confidence).toBe("unknown");
    expect(result.diagrams).toEqual([]);
  });
});

describe("extractMermaidBlocks", () => {
  test("extracts single mermaid block", () => {
    const blocks = extractMermaidBlocks(SAMPLE_OUTPUT);
    expect(blocks.length).toBe(1);
    expect(blocks[0]).toContain("graph TD");
  });

  test("extracts multiple mermaid blocks", () => {
    const blocks = extractMermaidBlocks(MULTI_DIAGRAM_OUTPUT);
    expect(blocks.length).toBe(2);
    expect(blocks[0]).toContain("graph TD");
    expect(blocks[1]).toContain("sequenceDiagram");
  });

  test("returns empty array when no mermaid blocks", () => {
    const blocks = extractMermaidBlocks("No diagrams here.");
    expect(blocks).toEqual([]);
  });
});

describe("generateDiagramUrl", () => {
  test("generates mermaid.live URL", () => {
    const mermaidCode = "graph TD\n  A --> B";
    const url = generateDiagramUrl(mermaidCode, "mermaid");
    expect(url).toStartWith("https://mermaid.live/edit#");
  });

  test("generates excalidraw-compatible data", () => {
    const mermaidCode = "graph TD\n  A --> B";
    const url = generateDiagramUrl(mermaidCode, "excalidraw");
    expect(typeof url).toBe("string");
    expect(url.length).toBeGreaterThan(0);
  });
});

describe("generateHtmlDiagram", () => {
  test("generates self-contained HTML with mermaid.js", () => {
    const mermaidCode = "graph TD\n  A --> B";
    const html = generateHtmlDiagram(mermaidCode);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("mermaid");
    expect(html).toContain("graph TD");
  });
});

describe("formatTerminalOutput", () => {
  test("formats a parsed result for terminal display", () => {
    const result = parseStructuredOutput(SAMPLE_OUTPUT);
    const formatted = formatTerminalOutput(result);
    expect(formatted).toContain("Summary");
    expect(formatted).toContain("Key Files");
    expect(formatted).toContain("src/index.ts");
  });
});
