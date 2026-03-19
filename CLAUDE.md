# Code Explorer — Agent Onboarding

CLI tool that uses LLMs to explore codebases and answer questions with file:line citations and Mermaid diagrams.

## Quick Start

```bash
bun install
bun test              # 67 tests, must all pass
bun run dev . "How is this project structured?"   # Run against itself
bun run build         # Compile to standalone binary at bin/code-explorer
```

## Architecture

```
src/
├── index.ts         # CLI entry (commander). Parses args, runs explore(), handles output/diagrams/save/interactive.
├── explorer.ts      # Core orchestration. Resolves source → context, runs LLM tool-use loop, returns structured result.
├── detect.ts        # Project type detection. Scans config files → returns type, language, deps, focus areas, LLM context string.
├── filter.ts        # File filtering. Combines .gitignore + default exclusions + binary detection + size limits.
├── output.ts        # Output parsing. Splits LLM response into Summary/Findings/Diagrams/KeyFiles/Confidence. Terminal formatting.
├── prompts.ts       # System prompts. Base strategy + 4 mode-specific prompts (architecture/trace/onboard/search).
├── interactive.ts   # REPL. Readline loop with /help /mode /diagram /save /quit. Preserves full message history.
├── llm/
│   └── provider.ts  # Unified LLMProvider interface. Implementations: Gemini, Anthropic, OpenAI, OpenRouter.
│                      Model aliases (flash/sonnet/haiku/gpt5/deepseek) resolve to latest model IDs.
│                      getModelInfo() handles alias resolution + pricing. createProvider() instantiates.
├── tools/
│   ├── tree.ts      # Directory tree generation with recursive filtering.
│   ├── read.ts      # File reading with line ranges, binary detection, size truncation.
│   ├── grep.ts      # Regex search across files. Max 100 matches. Groups by file.
│   └── glob.ts      # Glob pattern matching. Max 200 results.
└── remote/
    ├── github.ts    # GitHub REST API v3. No clone needed. Parses github:owner/repo and full URLs.
    ├── gitlab.ts    # GitLab REST API v4. No clone needed. Parses gitlab:group/project.
    └── clone.ts     # Shallow git clone to temp dir. Fallback for generic git URLs.
```

## Key Design Decisions

- **Unified LLMProvider**: Single interface for all models. Each provider translates to/from a common LLMMessage format. Gemini requires `_rawParts` passthrough for thought_signature fields.
- **Parallel tool execution**: When the LLM requests multiple tool calls in one response, they execute concurrently via Promise.all. This cuts exploration time 30-50%.
- **Structured output**: The system prompt instructs the LLM to always produce ## Summary, ## Findings, ## Diagram (mermaid), ## Key Files (table), ## Confidence. The output module parses these sections.
- **Project detection runs before exploration**: detect.ts scans for config files and injects a context string (e.g., "This is a Node.js project written in TypeScript using express, prisma") into the LLM prompt so it knows what it's looking at.

## How the Exploration Loop Works

1. `explore()` resolves the source (local/GitHub/GitLab/git URL) into a SourceContext
2. `detectProject()` identifies project type and builds LLM context
3. `getInitialTree()` generates the directory tree
4. `runExploration()` enters a tool-use loop (max 25 iterations):
   - Send messages to LLM with system prompt + tools
   - If LLM returns tool calls → execute in parallel → append results → loop
   - If LLM returns text (done) → return the answer
5. `parseStructuredOutput()` splits the answer into sections
6. CLI displays formatted output, opens diagrams, saves files, or enters interactive mode

## Testing

```bash
bun test                          # All tests
bun test tests/detect.test.ts     # Just detection
bun test tests/llm-provider.test.ts  # Just provider
```

Tests use fixture directories in `tests/fixtures/` with minimal config files for each project type. LLM provider tests verify message formatting and model resolution without making API calls.

## Rules

- Run `bun test` before committing — all 67 tests must pass
- Run `bun run build` to verify the binary compiles
- File references use format `path/file.ts:45` or `path/file.ts:45-67`
- No inline comments or docstrings in code
- Commit messages: imperative, concise, no attribution
