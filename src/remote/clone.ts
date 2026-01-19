import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "path";
import { $ } from "bun";

export interface CloneResult {
  path: string;
  cleanup: () => Promise<void>;
}

export function isGitUrl(input: string): boolean {
  return (
    input.startsWith("https://") ||
    input.startsWith("git@") ||
    input.startsWith("ssh://") ||
    input.endsWith(".git")
  );
}

export async function shallowClone(
  url: string,
  branch?: string,
): Promise<CloneResult> {
  const tempDir = await mkdtemp(join(tmpdir(), "code-explorer-"));

  try {
    const branchArgs = branch ? ["-b", branch] : [];
    await $`git clone --depth 1 ${branchArgs} ${url} ${tempDir}`.quiet();

    return {
      path: tempDir,
      cleanup: async () => {
        try {
          await rm(tempDir, { recursive: true, force: true });
        } catch {
          // Ignore cleanup errors
        }
      },
    };
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    throw new Error(
      `Failed to clone repository: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function extractRepoName(url: string): string {
  const match = url.match(/\/([^\/]+?)(\.git)?$/);
  return match ? match[1] : "repository";
}
