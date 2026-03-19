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
├── index.ts         # CLI entry point (commander)
├── explorer.ts      # Core orchestration (source context, tool execution, exploration loop)
├── detect.ts        # Project type detection (Node/Python/Go/Rust/Rails/React/monorepo)
├── filter.ts        # Smart filtering (.gitignore, defaults, binary detection)
├── output.ts        # Structured output parsing, Mermaid extraction, terminal formatting
├── prompts.ts       # Expert system prompts with 4 exploration modes
├── llm/
│   └── provider.ts  # Unified LLM provider (Gemini, Anthropic, OpenAI, OpenRouter)
├── tools/
│   ├── tree.ts      # Directory tree generation
│   ├── read.ts      # File reading with line limits
│   ├── grep.ts      # Pattern searching
│   └── glob.ts      # File pattern matching
└── remote/
    ├── github.ts    # GitHub API (no clone)
    ├── gitlab.ts    # GitLab API (no clone)
    └── clone.ts     # Shallow clone fallback
```

## Key Patterns

- Unified LLMProvider interface for all models
- Parallel tool execution (Promise.all for concurrent reads/greps)
- Expert prompts with 4 modes: architecture, trace, onboard, search
- Structured output: Summary, Findings, Diagram (Mermaid), Key Files, Confidence
- Auto-detect project type and inject context into LLM prompt
- File references in format: `path/file.ts:45` or `path/file.ts:45-67`
