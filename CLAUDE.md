# Code Explorer

CLI tool for exploring codebases with LLM-powered analysis.

## Development

```bash
bun install       # Install dependencies
bun run dev       # Run directly
bun run build     # Compile to binary
bun test          # Run tests
```

## Architecture

```
src/
├── index.ts      # CLI entry point (commander)
├── explorer.ts   # Core orchestration logic
├── filter.ts     # Smart filtering (.gitignore, defaults)
├── llm/
│   ├── gemini.ts # Gemini Flash API client
│   └── haiku.ts  # Claude Haiku API client
├── tools/
│   ├── tree.ts   # Directory tree generation
│   ├── read.ts   # File reading with line limits
│   ├── grep.ts   # Pattern searching
│   └── glob.ts   # File pattern matching
└── remote/
    ├── github.ts # GitHub API (no clone)
    ├── gitlab.ts # GitLab API (no clone)
    └── clone.ts  # Shallow clone fallback
```

## Key Patterns

- Uses Bun APIs (Bun.file, Bun.$)
- LLM tool-use loop for exploration
- Progressive disclosure (tree -> targeted exploration -> answer)
- File references in format: `path/file.ts:45` or `path/file.ts:45-67`
