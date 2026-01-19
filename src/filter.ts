import ignore, { type Ignore } from "ignore";
import { join, relative } from "path";

const DEFAULT_EXCLUSIONS = [
  ".git",
  "node_modules",
  "vendor",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".tox",
  ".venv",
  "venv",
  ".env",
  "env",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".output",
  "coverage",
  ".nyc_output",
  ".turbo",
  ".vercel",
  ".netlify",
  "target",
  "*.pyc",
  "*.pyo",
  "*.class",
  "*.o",
  "*.so",
  "*.dylib",
  "*.dll",
  "*.exe",
  "*.bin",
  "*.jar",
  "*.war",
  "*.ear",
  "*.png",
  "*.jpg",
  "*.jpeg",
  "*.gif",
  "*.ico",
  "*.svg",
  "*.webp",
  "*.mp3",
  "*.mp4",
  "*.wav",
  "*.avi",
  "*.mov",
  "*.pdf",
  "*.zip",
  "*.tar",
  "*.gz",
  "*.rar",
  "*.7z",
  "*.woff",
  "*.woff2",
  "*.ttf",
  "*.eot",
  "*.lock",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "Cargo.lock",
  "Gemfile.lock",
  "poetry.lock",
  ".DS_Store",
  "Thumbs.db",
];

const MAX_FILE_SIZE = 100 * 1024; // 100KB

export interface FilterOptions {
  basePath: string;
  extraExclusions?: string[];
  extraInclusions?: string[];
}

export class FileFilter {
  private ig: Ignore;
  private basePath: string;
  private inclusions: string[];

  constructor(options: FilterOptions) {
    this.basePath = options.basePath;
    this.ig = ignore();
    this.inclusions = options.extraInclusions || [];

    this.ig.add(DEFAULT_EXCLUSIONS);

    if (options.extraExclusions) {
      this.ig.add(options.extraExclusions);
    }
  }

  async loadGitignore(): Promise<void> {
    const gitignorePath = join(this.basePath, ".gitignore");
    try {
      const content = await Bun.file(gitignorePath).text();
      const lines = content
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"));
      this.ig.add(lines);
    } catch {
      // .gitignore doesn't exist, that's fine
    }
  }

  isIgnored(filePath: string): boolean {
    const relativePath = relative(this.basePath, filePath);
    if (!relativePath || relativePath.startsWith("..")) {
      return true;
    }

    if (this.inclusions.length > 0) {
      const matchesInclusion = this.inclusions.some((pattern) => {
        if (pattern.includes("*")) {
          const regex = new RegExp(
            "^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$",
          );
          return regex.test(relativePath);
        }
        return relativePath.includes(pattern);
      });
      if (matchesInclusion) {
        return false;
      }
    }

    return this.ig.ignores(relativePath);
  }

  async isFileTooLarge(filePath: string): Promise<boolean> {
    try {
      const file = Bun.file(filePath);
      const size = file.size;
      return size > MAX_FILE_SIZE;
    } catch {
      return true;
    }
  }

  async shouldIncludeFile(filePath: string): Promise<boolean> {
    if (this.isIgnored(filePath)) {
      return false;
    }
    if (await this.isFileTooLarge(filePath)) {
      return false;
    }
    return true;
  }

  shouldIncludeDirectory(dirPath: string): boolean {
    return !this.isIgnored(dirPath);
  }
}

export async function createFilter(
  basePath: string,
  extraExclusions?: string[],
  extraInclusions?: string[],
): Promise<FileFilter> {
  const filter = new FileFilter({
    basePath,
    extraExclusions,
    extraInclusions,
  });
  await filter.loadGitignore();
  return filter;
}
