import { readdir, stat } from "node:fs/promises";
import { join, basename } from "path";
import type { FileFilter } from "../filter";

export interface TreeOptions {
  maxDepth?: number;
  filter: FileFilter;
}

export interface TreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: TreeNode[];
}

async function buildTree(
  dirPath: string,
  filter: FileFilter,
  maxDepth: number,
  currentDepth: number = 0,
): Promise<TreeNode[]> {
  if (currentDepth >= maxDepth) {
    return [];
  }

  const entries = await readdir(dirPath, { withFileTypes: true });
  const nodes: TreeNode[] = [];

  const sortedEntries = entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  for (const entry of sortedEntries) {
    const fullPath = join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (!filter.shouldIncludeDirectory(fullPath)) {
        continue;
      }

      const children = await buildTree(
        fullPath,
        filter,
        maxDepth,
        currentDepth + 1,
      );

      nodes.push({
        name: entry.name,
        path: fullPath,
        type: "directory",
        children,
      });
    } else if (entry.isFile()) {
      if (!(await filter.shouldIncludeFile(fullPath))) {
        continue;
      }

      nodes.push({
        name: entry.name,
        path: fullPath,
        type: "file",
      });
    }
  }

  return nodes;
}

export function formatTree(
  nodes: TreeNode[],
  prefix: string = "",
  isLast: boolean[] = [],
): string {
  let result = "";

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const isLastNode = i === nodes.length - 1;

    let linePrefix = "";
    for (let j = 0; j < isLast.length; j++) {
      linePrefix += isLast[j] ? "    " : "│   ";
    }

    const connector = isLastNode ? "└── " : "├── ";
    const icon = node.type === "directory" ? "📁 " : "";

    result += linePrefix + connector + icon + node.name + "\n";

    if (node.children && node.children.length > 0) {
      result += formatTree(node.children, prefix, [...isLast, isLastNode]);
    }
  }

  return result;
}

export async function generateTree(
  basePath: string,
  options: TreeOptions,
): Promise<{ tree: TreeNode[]; formatted: string }> {
  const maxDepth = options.maxDepth ?? 4;

  const tree = await buildTree(basePath, options.filter, maxDepth);

  const rootName = basename(basePath) || basePath;
  const formatted = `📁 ${rootName}\n` + formatTree(tree);

  return { tree, formatted };
}

export function flattenTree(nodes: TreeNode[]): string[] {
  const paths: string[] = [];

  for (const node of nodes) {
    paths.push(node.path);
    if (node.children) {
      paths.push(...flattenTree(node.children));
    }
  }

  return paths;
}
