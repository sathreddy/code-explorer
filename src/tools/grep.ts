import { readdir, stat } from "node:fs/promises";
import { join, relative } from "path";
import type { FileFilter } from "../filter";

const MAX_MATCHES = 100;
const CONTEXT_LINES = 2;

export interface GrepMatch {
  file: string;
  line: number;
  content: string;
  context?: { before: string[]; after: string[] };
}

export interface GrepResult {
  pattern: string;
  matches: GrepMatch[];
  totalMatches: number;
  truncated: boolean;
}

async function searchFile(
  filePath: string,
  basePath: string,
  regex: RegExp,
  includeContext: boolean,
): Promise<GrepMatch[]> {
  const matches: GrepMatch[] = [];

  try {
    const content = await Bun.file(filePath).text();
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        const match: GrepMatch = {
          file: relative(basePath, filePath),
          line: i + 1,
          content: lines[i].trim(),
        };

        if (includeContext) {
          match.context = {
            before: lines
              .slice(Math.max(0, i - CONTEXT_LINES), i)
              .map((l) => l.trim()),
            after: lines
              .slice(i + 1, i + 1 + CONTEXT_LINES)
              .map((l) => l.trim()),
          };
        }

        matches.push(match);
      }
    }
  } catch {
    // Skip files that can't be read
  }

  return matches;
}

async function searchDirectory(
  dirPath: string,
  basePath: string,
  regex: RegExp,
  filter: FileFilter,
  matches: GrepMatch[],
  includeContext: boolean,
): Promise<void> {
  if (matches.length >= MAX_MATCHES) return;

  const entries = await readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (matches.length >= MAX_MATCHES) break;

    const fullPath = join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (filter.shouldIncludeDirectory(fullPath)) {
        await searchDirectory(
          fullPath,
          basePath,
          regex,
          filter,
          matches,
          includeContext,
        );
      }
    } else if (entry.isFile()) {
      if (await filter.shouldIncludeFile(fullPath)) {
        const fileMatches = await searchFile(
          fullPath,
          basePath,
          regex,
          includeContext,
        );
        for (const match of fileMatches) {
          if (matches.length >= MAX_MATCHES) break;
          matches.push(match);
        }
      }
    }
  }
}

export async function grep(
  basePath: string,
  pattern: string,
  filter: FileFilter,
  options: { includeContext?: boolean; caseInsensitive?: boolean } = {},
): Promise<GrepResult> {
  const flags = options.caseInsensitive ? "gi" : "g";
  let regex: RegExp;

  try {
    regex = new RegExp(pattern, flags);
  } catch {
    regex = new RegExp(escapeRegex(pattern), flags);
  }

  const matches: GrepMatch[] = [];
  await searchDirectory(
    basePath,
    basePath,
    regex,
    filter,
    matches,
    options.includeContext ?? false,
  );

  return {
    pattern,
    matches,
    totalMatches: matches.length,
    truncated: matches.length >= MAX_MATCHES,
  };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function formatGrepResult(result: GrepResult): string {
  if (result.matches.length === 0) {
    return `No matches found for pattern: "${result.pattern}"`;
  }

  let output = `Found ${result.totalMatches} matches for "${result.pattern}"`;
  if (result.truncated) {
    output += ` (showing first ${MAX_MATCHES})`;
  }
  output += ":\n\n";

  const byFile = new Map<string, GrepMatch[]>();
  for (const match of result.matches) {
    const existing = byFile.get(match.file) || [];
    existing.push(match);
    byFile.set(match.file, existing);
  }

  for (const [file, matches] of byFile) {
    output += `=== ${file} ===\n`;
    for (const match of matches) {
      output += `  ${match.line}: ${match.content}\n`;
    }
    output += "\n";
  }

  return output.trim();
}
