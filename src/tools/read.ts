import { relative } from "path";

const DEFAULT_MAX_LINES = 500;
const MAX_LINE_LENGTH = 1000;

export interface ReadOptions {
  startLine?: number;
  endLine?: number;
  maxLines?: number;
}

export interface ReadResult {
  content: string;
  totalLines: number;
  linesRead: number;
  startLine: number;
  endLine: number;
  truncated: boolean;
  path: string;
}

function isBinaryContent(content: string): boolean {
  const sampleSize = Math.min(content.length, 8000);
  let nullCount = 0;
  let controlCount = 0;

  for (let i = 0; i < sampleSize; i++) {
    const code = content.charCodeAt(i);
    if (code === 0) nullCount++;
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) controlCount++;
  }

  return nullCount > 0 || controlCount / sampleSize > 0.1;
}

export async function readFile(
  filePath: string,
  basePath: string,
  options: ReadOptions = {},
): Promise<ReadResult> {
  const file = Bun.file(filePath);

  if (!(await file.exists())) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = await file.text();

  if (isBinaryContent(content)) {
    return {
      content: "[Binary file - content not displayed]",
      totalLines: 0,
      linesRead: 0,
      startLine: 0,
      endLine: 0,
      truncated: false,
      path: relative(basePath, filePath),
    };
  }

  const lines = content.split("\n");
  const totalLines = lines.length;

  const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
  const startLine = Math.max(1, options.startLine ?? 1);
  const endLine = Math.min(
    totalLines,
    options.endLine ?? startLine + maxLines - 1,
  );

  const selectedLines = lines.slice(startLine - 1, endLine);
  const linesRead = selectedLines.length;
  const truncated = endLine < totalLines;

  const formattedLines = selectedLines.map((line, idx) => {
    const lineNum = startLine + idx;
    const truncatedLine =
      line.length > MAX_LINE_LENGTH
        ? line.substring(0, MAX_LINE_LENGTH) + "..."
        : line;
    return `${lineNum.toString().padStart(4)}│ ${truncatedLine}`;
  });

  return {
    content: formattedLines.join("\n"),
    totalLines,
    linesRead,
    startLine,
    endLine,
    truncated,
    path: relative(basePath, filePath),
  };
}

export function formatReadResult(result: ReadResult): string {
  let output = `=== ${result.path} ===\n`;
  output += `Lines ${result.startLine}-${result.endLine} of ${result.totalLines}`;

  if (result.truncated) {
    output += ` (truncated)`;
  }

  output += `\n\n${result.content}`;

  return output;
}
