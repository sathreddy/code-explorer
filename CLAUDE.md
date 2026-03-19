# CLAUDE.md

CLI tool that uses LLMs to explore codebases and answer questions with file:line citations and Mermaid diagrams. Built with Bun + TypeScript.

## Project map

```
src/
├── index.ts         — CLI entry (commander), parses args, runs explore(), handles output/diagrams/save/interactive
├── explorer.ts      — Core orchestration: source → context → LLM tool-use loop → structured result
├── detect.ts        — Project type detection from config files → type, language, deps, focus areas
├── filter.ts        — File filtering: .gitignore + default exclusions + binary detection + size limits
├── output.ts        — Parses LLM response into Summary/Findings/Diagrams/KeyFiles/Confidence sections
├── prompts.ts       — System prompts: base strategy + 4 mode-specific (architecture/trace/onboard/search)
├── interactive.ts   — REPL with /help /mode /diagram /save /quit, preserves message history
├── llm/
│   └── provider.ts  — Unified LLMProvider interface: Gemini, Anthropic, OpenAI, OpenRouter
├── tools/
│   ├── tree.ts      — Directory tree with recursive filtering
│   ├── read.ts      — File reading with line ranges, binary detection, size truncation
│   ├── grep.ts      — Regex search across files (max 100 matches, grouped by file)
│   └── glob.ts      — Glob pattern matching (max 200 results)
└── remote/
    ├── github.ts    — GitHub REST API v3 (no clone needed)
    ├── gitlab.ts    — GitLab REST API v4 (no clone needed)
    └── clone.ts     — Shallow git clone to temp dir for generic git URLs
```

<important if="you need to run commands to build, test, lint, or install">

| Command | What it does |
|---|---|
| `bun install` | Install dependencies |
| `bun test` | Run all tests (must pass before committing) |
| `bun test tests/<file>` | Run a specific test file |
| `bun run dev . "query"` | Run against a local directory |
| `bun run build` | Compile to standalone binary at `bin/code-explorer` |

</important>

<important if="you are modifying the LLM provider interface or adding a new LLM provider">

- Unified LLMProvider interface: all providers translate to/from a common LLMMessage format
- Gemini requires `_rawParts` passthrough for `thought_signature` fields on tool calls
- Model aliases (flash/sonnet/haiku/gpt5/deepseek) resolve to latest model IDs via `getModelInfo()`
- `createProvider()` instantiates the correct provider class

</important>

<important if="you are modifying the exploration loop, tool execution, or how LLM calls are orchestrated">

Exploration flow in `explorer.ts`:
1. Resolve source (local/GitHub/GitLab/git URL) → SourceContext
2. `detectProject()` identifies project type, injects context into LLM prompt
3. `getInitialTree()` generates directory tree
4. `runExploration()` tool-use loop (max 25 iterations): LLM returns tool calls → execute in parallel via Promise.all → append results → loop until LLM returns text
5. `parseStructuredOutput()` splits answer into sections

</important>

<important if="you are writing or modifying tests">

- Tests use fixture directories in `tests/fixtures/` with minimal config files per project type
- LLM provider tests verify message formatting and model resolution without API calls
- All tests must pass before committing

</important>

<important if="you are modifying how the LLM response is parsed or displayed">

- The system prompt (in `prompts.ts`) instructs the LLM to produce: ## Summary, ## Findings, ## Diagram (mermaid), ## Key Files (table), ## Confidence
- `output.ts` parses these sections and handles terminal formatting

</important>

<important if="you are writing code in this project">

- No inline comments or docstrings in code
- File references use format `path/file.ts:45` or `path/file.ts:45-67`

</important>

<important if="you are creating a commit">

- Run `bun test` before committing — all tests must pass
- Run `bun run build` to verify the binary compiles
- Commit messages: imperative, concise, no attribution

</important>
