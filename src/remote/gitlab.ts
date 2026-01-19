const GITLAB_API = "https://gitlab.com/api/v4";

export interface GitLabFile {
  id: string;
  name: string;
  path: string;
  type: "tree" | "blob";
}

function getAuthHeaders(): HeadersInit {
  const token = process.env.GITLAB_TOKEN;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["PRIVATE-TOKEN"] = token;
  }

  return headers;
}

export function parseGitLabUrl(
  input: string,
): { projectId: string; path: string; ref: string } | null {
  // Format: gitlab:group/project or gitlab:group/subgroup/project
  if (input.startsWith("gitlab:")) {
    const projectPath = input.slice(7);
    const encodedPath = encodeURIComponent(projectPath);
    return {
      projectId: encodedPath,
      path: "",
      ref: "HEAD",
    };
  }

  // Format: https://gitlab.com/group/project
  const match = input.match(
    /gitlab\.com\/(.+?)(?:\.git)?(?:\/-\/tree\/([^\/]+))?(?:\/(.*))?$/,
  );
  if (match) {
    return {
      projectId: encodeURIComponent(match[1]),
      ref: match[2] || "HEAD",
      path: match[3] || "",
    };
  }

  return null;
}

export async function getDefaultBranch(projectId: string): Promise<string> {
  const response = await fetch(`${GITLAB_API}/projects/${projectId}`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Failed to get project info: ${response.statusText}`);
  }

  const data = (await response.json()) as { default_branch: string };
  return data.default_branch;
}

export async function listContents(
  projectId: string,
  path: string = "",
  ref: string = "HEAD",
): Promise<GitLabFile[]> {
  let actualRef = ref;
  if (ref === "HEAD") {
    actualRef = await getDefaultBranch(projectId);
  }

  const pathParam = path ? `&path=${encodeURIComponent(path)}` : "";
  const url = `${GITLAB_API}/projects/${projectId}/repository/tree?ref=${actualRef}${pathParam}`;

  const response = await fetch(url, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Path not found: ${path || "/"}`);
    }
    throw new Error(`GitLab API error: ${response.statusText}`);
  }

  const data = (await response.json()) as GitLabFile[];

  return data.map((item) => ({
    id: item.id,
    name: item.name,
    path: item.path,
    type: item.type,
  }));
}

export async function getFileContent(
  projectId: string,
  path: string,
  ref: string = "HEAD",
): Promise<string> {
  let actualRef = ref;
  if (ref === "HEAD") {
    actualRef = await getDefaultBranch(projectId);
  }

  const encodedPath = encodeURIComponent(path);
  const url = `${GITLAB_API}/projects/${projectId}/repository/files/${encodedPath}/raw?ref=${actualRef}`;

  const response = await fetch(url, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`File not found: ${path}`);
    }
    throw new Error(`GitLab API error: ${response.statusText}`);
  }

  return response.text();
}

export async function buildGitLabTree(
  projectId: string,
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

  const contents = await listContents(projectId, path, ref);
  const tree: {
    name: string;
    path: string;
    type: "file" | "dir";
    children?: unknown[];
  }[] = [];

  const sortedContents = contents.sort((a, b) => {
    if (a.type === "tree" && b.type !== "tree") return -1;
    if (a.type !== "tree" && b.type === "tree") return 1;
    return a.name.localeCompare(b.name);
  });

  for (const item of sortedContents) {
    if (allExcludes.some((pattern) => item.name === pattern)) {
      continue;
    }

    if (item.type === "tree") {
      const children = await buildGitLabTree(
        projectId,
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

export function formatGitLabTree(
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
      result += formatGitLabTree(
        node.children as { name: string; type: string; children?: unknown[] }[],
        prefix,
        [...isLast, isLastNode],
      );
    }
  }

  return result;
}
