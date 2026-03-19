import chalk from "chalk";

export interface KeyFile {
  file: string;
  purpose: string;
  lines?: string;
}

export interface ExplorationResult {
  summary: string;
  findings: string;
  diagrams: string[];
  keyFiles: KeyFile[];
  confidence: "high" | "medium" | "low" | "unknown";
  raw: string;
}

export function extractMermaidBlocks(text: string): string[] {
  const blocks: string[] = [];
  const regex = /```mermaid\s*\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match[1]) blocks.push(match[1].trim());
  }
  return blocks;
}

function extractSection(text: string, heading: string): string {
  const headingRegex = new RegExp(`^##\\s+${heading}\\s*$`, "mi");
  const match = headingRegex.exec(text);
  if (!match) return "";

  const start = match.index + match[0].length;
  const nextHeading = text.slice(start).search(/^##\s+/m);
  const end = nextHeading === -1 ? text.length : start + nextHeading;
  return text.slice(start, end).trim();
}

function parseKeyFilesTable(text: string): KeyFile[] {
  const section = extractSection(text, "Key Files");
  if (!section) return [];

  const lines = section.split("\n").filter((l) => l.includes("|"));
  const dataLines = lines.filter((l) => !l.match(/^\s*\|?\s*[-:]+/));

  const files: KeyFile[] = [];
  for (const line of dataLines) {
    const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
    if (cells.length >= 2 && cells[0] !== "File") {
      files.push({
        file: cells[0] ?? "",
        purpose: cells[1] ?? "",
        lines: cells[2],
      });
    }
  }
  return files;
}

function parseConfidence(text: string): ExplorationResult["confidence"] {
  const section = extractSection(text, "Confidence");
  if (!section) return "unknown";

  const lower = section.toLowerCase();
  if (lower.startsWith("high")) return "high";
  if (lower.startsWith("medium")) return "medium";
  if (lower.startsWith("low")) return "low";
  return "unknown";
}

export function parseStructuredOutput(text: string): ExplorationResult {
  const summary = extractSection(text, "Summary");
  const findings = extractSection(text, "Findings") || extractSection(text, "Architecture");
  const diagrams = extractMermaidBlocks(text);
  const keyFiles = parseKeyFilesTable(text);
  const confidence = parseConfidence(text);

  const hasSections = summary || findings;

  return {
    summary: summary || "",
    findings: findings || (hasSections ? "" : text.trim()),
    diagrams,
    keyFiles,
    confidence,
    raw: text,
  };
}

export function generateDiagramUrl(mermaidCode: string, target: "mermaid" | "excalidraw"): string {
  if (target === "mermaid") {
    const state = JSON.stringify({ code: mermaidCode, mermaid: { theme: "default" }, autoSync: true, updateDiagram: true });
    const encoded = Buffer.from(state).toString("base64url");
    return `https://mermaid.live/edit#base64:${encoded}`;
  }

  if (target === "excalidraw") {
    const encoded = Buffer.from(mermaidCode).toString("base64url");
    return `excalidraw://mermaid/${encoded}`;
  }

  return "";
}

export function generateHtmlDiagram(mermaidCode: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Code Explorer Diagram</title>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"><\/script>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: #1a1a2e;
      color: #eee;
    }
    .container { max-width: 1200px; padding: 2rem; }
    .mermaid { background: #fff; border-radius: 8px; padding: 2rem; }
  </style>
</head>
<body>
  <div class="container">
    <div class="mermaid">
${mermaidCode}
    </div>
  </div>
  <script>mermaid.initialize({ startOnLoad: true, theme: 'default' });<\/script>
</body>
</html>`;
}

export function formatTerminalOutput(result: ExplorationResult): string {
  const lines: string[] = [];

  if (result.summary) {
    lines.push(chalk.bold.underline("Summary"));
    lines.push(result.summary);
    lines.push("");
  }

  if (result.findings) {
    lines.push(chalk.bold.underline("Findings"));
    lines.push(result.findings);
    lines.push("");
  }

  if (result.diagrams.length > 0) {
    lines.push(chalk.bold.underline("Diagrams"));
    for (const diagram of result.diagrams) {
      lines.push(chalk.dim("```mermaid"));
      lines.push(chalk.cyan(diagram));
      lines.push(chalk.dim("```"));
      lines.push("");
    }
  }

  if (result.keyFiles.length > 0) {
    lines.push(chalk.bold.underline("Key Files"));
    const maxFile = Math.max(...result.keyFiles.map((f) => f.file.length), 4);
    const maxPurpose = Math.max(...result.keyFiles.map((f) => f.purpose.length), 7);
    lines.push(
      chalk.dim(
        `  ${"File".padEnd(maxFile)}  ${"Purpose".padEnd(maxPurpose)}  Lines`,
      ),
    );
    lines.push(chalk.dim(`  ${"─".repeat(maxFile)}  ${"─".repeat(maxPurpose)}  ${"─".repeat(8)}`));
    for (const f of result.keyFiles) {
      lines.push(`  ${chalk.green(f.file.padEnd(maxFile))}  ${f.purpose.padEnd(maxPurpose)}  ${chalk.dim(f.lines ?? "")}`);
    }
    lines.push("");
  }

  if (result.confidence !== "unknown") {
    const badge =
      result.confidence === "high"
        ? chalk.green("HIGH")
        : result.confidence === "medium"
          ? chalk.yellow("MEDIUM")
          : chalk.red("LOW");
    lines.push(`${chalk.bold("Confidence:")} ${badge}`);
  }

  return lines.join("\n");
}
