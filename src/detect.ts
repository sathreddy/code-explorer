import { join } from "path";

export interface ProjectInfo {
  type: "node" | "python" | "go" | "rust" | "rails" | "react" | "monorepo" | "unknown";
  language: string;
  name: string;
  framework?: string;
  monorepoTool?: string;
  dependencies: string[];
  focusAreas: string[];
  contextString: string;
}

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

async function fileExists(path: string): Promise<boolean> {
  return Bun.file(path).exists();
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    const content = await Bun.file(path).text();
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

async function readText(path: string): Promise<string | null> {
  try {
    return await Bun.file(path).text();
  } catch {
    return null;
  }
}

function extractDepsFromPackageJson(pkg: PackageJson): string[] {
  const deps = new Set<string>();
  for (const name of Object.keys(pkg.dependencies ?? {})) {
    deps.add(name);
  }
  for (const name of Object.keys(pkg.devDependencies ?? {})) {
    deps.add(name);
  }
  return [...deps];
}

function extractPyDeps(content: string): string[] {
  const deps: string[] = [];
  const depMatch = content.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
  if (depMatch && depMatch[1]) {
    const matches = depMatch[1].matchAll(/"([^">=<\[]+)|'([^'>=<\[]+)/g);
    for (const m of matches) {
      const name = (m[1] ?? m[2] ?? "").trim().toLowerCase();
      if (name) deps.push(name);
    }
  }
  return deps;
}

function extractGoDeps(content: string): string[] {
  const deps: string[] = [];
  const lines = content.split("\n");
  for (const line of lines) {
    const match = line.match(/^\s*require\s+([\S]+)/);
    if (match && match[1]) deps.push(match[1]);
    const blockMatch = line.match(/^\s+([\S]+)\s+v/);
    if (blockMatch && blockMatch[1] && !blockMatch[1].startsWith("//")) {
      deps.push(blockMatch[1]);
    }
  }
  return deps;
}

function extractCargoDeps(content: string): string[] {
  const deps: string[] = [];
  let inDeps = false;
  for (const line of content.split("\n")) {
    if (line.match(/^\[dependencies\]/)) {
      inDeps = true;
      continue;
    }
    if (line.match(/^\[/) && inDeps) {
      inDeps = false;
      continue;
    }
    if (inDeps) {
      const match = line.match(/^(\w[\w-]*)\s*=/);
      if (match && match[1]) deps.push(match[1]);
    }
  }
  return deps;
}

function extractGemfileDeps(content: string): string[] {
  const deps: string[] = [];
  for (const line of content.split("\n")) {
    const match = line.match(/^\s*gem\s+["']([^"']+)["']/);
    if (match && match[1]) deps.push(match[1]);
  }
  return deps;
}

function buildContextString(info: Omit<ProjectInfo, "contextString" | "focusAreas">): string {
  const parts: string[] = [];

  const typeLabels: Record<string, string> = {
    node: "Node.js",
    python: "Python",
    go: "Go",
    rust: "Rust",
    rails: "Ruby on Rails",
    react: "React",
    monorepo: "Monorepo",
    unknown: "Unknown",
  };

  const langLabels: Record<string, string> = {
    typescript: "TypeScript",
    javascript: "JavaScript",
    python: "Python",
    go: "Go",
    rust: "Rust",
    ruby: "Ruby",
    unknown: "Unknown",
  };

  parts.push(`This is a ${typeLabels[info.type] || info.type} project`);

  if (info.language && info.language !== "unknown") {
    parts.push(`written in ${langLabels[info.language] || info.language}`);
  }

  if (info.framework) {
    parts.push(`using the ${info.framework} framework`);
  }

  if (info.name) {
    parts.push(`named "${info.name}"`);
  }

  if (info.monorepoTool) {
    parts.push(`managed with ${info.monorepoTool}`);
  }

  let result = parts.join(", ") + ".";

  if (info.dependencies.length > 0) {
    const topDeps = info.dependencies.slice(0, 10);
    result += ` Key dependencies: ${topDeps.join(", ")}.`;
  }

  return result;
}

function buildFocusAreas(type: string, framework?: string): string[] {
  const common = ["README.md"];

  const focusMap: Record<string, string[]> = {
    node: [
      "package.json (scripts, entry points, dependencies)",
      "src/ or lib/ directory structure",
      "Entry point (index.ts, main.ts, app.ts)",
      "tsconfig.json for build configuration",
    ],
    python: [
      "pyproject.toml or setup.py for project metadata",
      "src/ or top-level package directory",
      "__init__.py files for module structure",
      "Entry point (__main__.py, cli.py, app.py)",
    ],
    go: [
      "go.mod for module name and dependencies",
      "cmd/ directory for CLI entry points",
      "internal/ for private packages",
      "pkg/ for public packages",
    ],
    rust: [
      "Cargo.toml for crate metadata",
      "src/lib.rs for library crate",
      "src/main.rs for binary crate",
      "Module structure via mod.rs files",
    ],
    rails: [
      "config/routes.rb for URL routing",
      "app/models/ for data models",
      "app/controllers/ for request handling",
      "db/schema.rb for database schema",
    ],
    react: [
      "package.json (scripts, dependencies)",
      "src/app/ or pages/ for route structure",
      "src/components/ for UI components",
      "API routes or server actions",
    ],
    monorepo: [
      "Root package.json or workspace config",
      "packages/ or apps/ directory for workspace members",
      "Shared packages and their dependencies",
      "Build orchestration config (turbo.json, nx.json)",
    ],
    unknown: [
      "Look for README, configuration files, and entry points",
    ],
  };

  if (framework === "next") {
    return [
      ...common,
      "next.config.* for Next.js configuration",
      "src/app/ or pages/ for route structure",
      "src/components/ for UI components",
      "API routes (app/api/ or pages/api/)",
    ];
  }

  return [...common, ...(focusMap[type] ?? focusMap.unknown ?? [])];
}

export async function detectProject(basePath: string): Promise<ProjectInfo> {
  const packageJsonPath = join(basePath, "package.json");
  const pyprojectPath = join(basePath, "pyproject.toml");
  const setupPyPath = join(basePath, "setup.py");
  const goModPath = join(basePath, "go.mod");
  const cargoTomlPath = join(basePath, "Cargo.toml");
  const gemfilePath = join(basePath, "Gemfile");
  const pnpmWorkspacePath = join(basePath, "pnpm-workspace.yaml");
  const turboJsonPath = join(basePath, "turbo.json");
  const lernaJsonPath = join(basePath, "lerna.json");
  const nextConfigJsPath = join(basePath, "next.config.js");
  const nextConfigMjsPath = join(basePath, "next.config.mjs");
  const nextConfigTsPath = join(basePath, "next.config.ts");
  const tsconfigPath = join(basePath, "tsconfig.json");

  const [
    hasPnpmWorkspace,
    hasTurboJson,
    hasLernaJson,
  ] = await Promise.all([
    fileExists(pnpmWorkspacePath),
    fileExists(turboJsonPath),
    fileExists(lernaJsonPath),
  ]);

  if (hasPnpmWorkspace || hasTurboJson || hasLernaJson) {
    const pkg = await readJson<PackageJson>(packageJsonPath);
    const monorepoTool = hasPnpmWorkspace ? "pnpm" : hasTurboJson ? "turbo" : "lerna";
    const base = {
      type: "monorepo" as const,
      language: "unknown",
      name: pkg?.name ?? "",
      monorepoTool,
      dependencies: [],
    };
    return {
      ...base,
      focusAreas: buildFocusAreas("monorepo"),
      contextString: buildContextString(base),
    };
  }

  if (await fileExists(gemfilePath)) {
    const content = await readText(gemfilePath);
    const deps = content ? extractGemfileDeps(content) : [];
    const base = {
      type: "rails" as const,
      language: "ruby",
      name: "",
      dependencies: deps,
    };
    return {
      ...base,
      focusAreas: buildFocusAreas("rails"),
      contextString: buildContextString(base),
    };
  }

  if (await fileExists(goModPath)) {
    const content = await readText(goModPath);
    const nameMatch = content?.match(/^module\s+(\S+)/m);
    const deps = content ? extractGoDeps(content) : [];
    const base = {
      type: "go" as const,
      language: "go",
      name: nameMatch?.[1] ?? "",
      dependencies: deps,
    };
    return {
      ...base,
      focusAreas: buildFocusAreas("go"),
      contextString: buildContextString(base),
    };
  }

  if (await fileExists(cargoTomlPath)) {
    const content = await readText(cargoTomlPath);
    const nameMatch = content?.match(/^name\s*=\s*"([^"]+)"/m);
    const deps = content ? extractCargoDeps(content) : [];
    const base = {
      type: "rust" as const,
      language: "rust",
      name: nameMatch?.[1] ?? "",
      dependencies: deps,
    };
    return {
      ...base,
      focusAreas: buildFocusAreas("rust"),
      contextString: buildContextString(base),
    };
  }

  if (await fileExists(pyprojectPath) || await fileExists(setupPyPath)) {
    const content = await readText(pyprojectPath);
    const nameMatch = content?.match(/^name\s*=\s*"([^"]+)"/m);
    const deps = content ? extractPyDeps(content) : [];
    const base = {
      type: "python" as const,
      language: "python",
      name: nameMatch?.[1] ?? "",
      dependencies: deps,
    };
    return {
      ...base,
      focusAreas: buildFocusAreas("python"),
      contextString: buildContextString(base),
    };
  }

  if (await fileExists(packageJsonPath)) {
    const pkg = await readJson<PackageJson>(packageJsonPath);
    const deps = pkg ? extractDepsFromPackageJson(pkg) : [];
    const hasTypeScript = await fileExists(tsconfigPath);
    const hasNext = await fileExists(nextConfigJsPath) ||
      await fileExists(nextConfigMjsPath) ||
      await fileExists(nextConfigTsPath);
    const hasReact = deps.includes("react");

    if (hasReact || hasNext) {
      const base = {
        type: "react" as const,
        language: hasTypeScript ? "typescript" : "javascript",
        name: pkg?.name ?? "",
        framework: hasNext ? "next" : undefined,
        dependencies: deps,
      };
      return {
        ...base,
        focusAreas: buildFocusAreas("react", base.framework),
        contextString: buildContextString(base),
      };
    }

    const base = {
      type: "node" as const,
      language: hasTypeScript ? "typescript" : "javascript",
      name: pkg?.name ?? "",
      dependencies: deps,
    };
    return {
      ...base,
      focusAreas: buildFocusAreas("node"),
      contextString: buildContextString(base),
    };
  }

  const base = {
    type: "unknown" as const,
    language: "unknown",
    name: "",
    dependencies: [] as string[],
  };
  return {
    ...base,
    focusAreas: buildFocusAreas("unknown"),
    contextString: buildContextString(base),
  };
}
