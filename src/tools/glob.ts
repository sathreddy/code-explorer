import { readdir } from "node:fs/promises";
import { join, relative } from "path";
import type { FileFilter } from "../filter";

const MAX_RESULTS = 200;

export interface GlobResult {
  pattern: string;
  files: string[];
  totalFiles: number;
  truncated: boolean;
}

function patternToRegex(pattern: string): RegExp {
  let regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "<<<GLOBSTAR>>>")
    .replace(/\*/g, "[^/]*")
    .replace(/<<<GLOBSTAR>>>/g, ".*")
    .replace(/\?/g, ".");

  return new RegExp(`^${regexStr}$`);
}

async function findFiles(
  dirPath: string,
  basePath: string,
  regex: RegExp,
  filter: FileFilter,
  files: string[],
): Promise<void> {
  if (files.length >= MAX_RESULTS) return;

  const entries = await readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (files.length >= MAX_RESULTS) break;

    const fullPath = join(dirPath, entry.name);
    const relativePath = relative(basePath, fullPath);

    if (entry.isDirectory()) {
      if (filter.shouldIncludeDirectory(fullPath)) {
        await findFiles(fullPath, basePath, regex, filter, files);
      }
    } else if (entry.isFile()) {
      if (
        (await filter.shouldIncludeFile(fullPath)) &&
        regex.test(relativePath)
      ) {
        files.push(relativePath);
      }
    }
  }
}

export async function glob(
  basePath: string,
  pattern: string,
  filter: FileFilter,
): Promise<GlobResult> {
  const regex = patternToRegex(pattern);
  const files: string[] = [];

  await findFiles(basePath, basePath, regex, filter, files);

  files.sort();

  return {
    pattern,
    files,
    totalFiles: files.length,
    truncated: files.length >= MAX_RESULTS,
  };
}

export function formatGlobResult(result: GlobResult): string {
  if (result.files.length === 0) {
    return `No files found matching pattern: "${result.pattern}"`;
  }

  let output = `Found ${result.totalFiles} files matching "${result.pattern}"`;
  if (result.truncated) {
    output += ` (showing first ${MAX_RESULTS})`;
  }
  output += ":\n\n";

  for (const file of result.files) {
    output += `  ${file}\n`;
  }

  return output.trim();
}
