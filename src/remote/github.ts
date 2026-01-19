const GITHUB_API = "https://api.github.com";

export interface GitHubFile {
  name: string;
  path: string;
  type: "file" | "dir";
  size?: number;
  sha: string;
}

export interface GitHubContent {
  content: string;
  encoding: string;
  size: number;
  path: string;
}

function getAuthHeaders(): HeadersInit {
  const token = process.env.GITHUB_TOKEN;
  const headers: HeadersInit = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "code-explorer",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return headers;
}

export function parseGitHubUrl(
  input: string,
): { owner: string; repo: string; path: string; ref: string } | null {
  // Format: github:owner/repo or github:owner/repo/path/to/dir
  if (input.startsWith("github:")) {
    const parts = input.slice(7).split("/");
    if (parts.length < 2) return null;

    const [owner, repo, ...pathParts] = parts;
    return {
      owner,
      repo,
      path: pathParts.join("/"),
      ref: "HEAD",
    };
  }

  // Format: https://github.com/owner/repo
  const match = input.match(
    /github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?(?:\/tree\/([^\/]+))?(?:\/(.*))?$/,
  );
  if (match) {
    return {
      owner: match[1],
      repo: match[2],
      ref: match[3] || "HEAD",
      path: match[4] || "",
    };
  }

  return null;
}

export async function getDefaultBranch(
  owner: string,
  repo: string,
): Promise<string> {
  const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Failed to get repo info: ${response.statusText}`);
  }

  const data = (await response.json()) as { default_branch: string };
  return data.default_branch;
}

export async function listContents(
  owner: string,
  repo: string,
  path: string = "",
  ref: string = "HEAD",
): Promise<GitHubFile[]> {
  const url = path
    ? `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}?ref=${ref}`
    : `${GITHUB_API}/repos/${owner}/${repo}/contents?ref=${ref}`;

  const response = await fetch(url, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Path not found: ${path || "/"}`);
    }
    throw new Error(`GitHub API error: ${response.statusText}`);
  }

  const data = await response.json();

  if (!Array.isArray(data)) {
    return [
      {
        name: data.name,
        path: data.path,
        type: data.type,
        size: data.size,
        sha: data.sha,
      },
    ];
  }

  return data.map((item: GitHubFile) => ({
    name: item.name,
    path: item.path,
    type: item.type === "dir" ? "dir" : "file",
    size: item.size,
    sha: item.sha,
  }));
}

export async function getFileContent(
  owner: string,
  repo: string,
  path: string,
  ref: string = "HEAD",
): Promise<string> {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}?ref=${ref}`;

  const response = await fetch(url, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`File not found: ${path}`);
    }
    throw new Error(`GitHub API error: ${response.statusText}`);
  }

  const data = (await response.json()) as GitHubContent;

  if (data.encoding === "base64") {
    return Buffer.from(data.content, "base64").toString("utf-8");
  }

  return data.content;
}

export async function buildGitHubTree(
  owner: string,
  repo: string,
  path: string = "",
  ref: string = "HEAD",
  maxDepth: number = 4,
  currentDepth: number = 0,
  excludePatterns: string[] = [],
): Promise<
  { name: string; path: string; type: "file" | "dir"; children?: unknown[] }[]
> {
  if (currentDepth >= maxDepth) {
    return [];
  }

  const defaultExcludes = [
    "node_modules",
    ".git",
    "vendor",
    "__pycache__",
    "dist",
    "build",
    ".next",
    "coverage",
  ];
  const allExcludes = [...defaultExcludes, ...excludePatterns];

  const contents = await listContents(owner, repo, path, ref);
  const tree: {
    name: string;
    path: string;
    type: "file" | "dir";
    children?: unknown[];
  }[] = [];

  const sortedContents = contents.sort((a, b) => {
    if (a.type === "dir" && b.type !== "dir") return -1;
    if (a.type !== "dir" && b.type === "dir") return 1;
    return a.name.localeCompare(b.name);
  });

  for (const item of sortedContents) {
    if (allExcludes.some((pattern) => item.name === pattern)) {
      continue;
    }

    if (item.type === "dir") {
      const children = await buildGitHubTree(
        owner,
        repo,
        item.path,
        ref,
        maxDepth,
        currentDepth + 1,
        excludePatterns,
      );

      tree.push({
        name: item.name,
        path: item.path,
        type: "dir",
        children,
      });
    } else {
      tree.push({
        name: item.name,
        path: item.path,
        type: "file",
      });
    }
  }

  return tree;
}

export function formatGitHubTree(
  nodes: { name: string; type: string; children?: unknown[] }[],
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
    const icon = node.type === "dir" ? "📁 " : "";

    result += linePrefix + connector + icon + node.name + "\n";

    if (
      node.children &&
      Array.isArray(node.children) &&
      node.children.length > 0
    ) {
      result += formatGitHubTree(
        node.children as { name: string; type: string; children?: unknown[] }[],
        prefix,
        [...isLast, isLastNode],
      );
    }
  }

  return result;
}
