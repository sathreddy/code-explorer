# Contributing to Code Explorer

## Setup

```bash
git clone https://github.com/sathreddy/code-explorer.git
cd code-explorer
bun install
bun test          # Verify everything works
```

Requires [Bun](https://bun.sh) v1.0+.

## Development Workflow

1. Create a branch for your change
2. Write tests first (TDD) — add to `tests/`
3. Implement the feature
4. Run `bun test` — all tests must pass
5. Run `bun run build` — binary must compile
6. Commit with a concise imperative message

## Running

```bash
# Development (no build needed)
bun run dev <source> "<question>" [options]

# Production binary
bun run build
./bin/code-explorer <source> "<question>" [options]
```

## Testing

```bash
bun test                              # All tests
bun test tests/detect.test.ts         # Specific file
bun test --watch                      # Watch mode
```

Test fixtures live in `tests/fixtures/` — each subdirectory is a minimal project skeleton for a specific language/framework.

## Project Structure

See [CLAUDE.md](CLAUDE.md) for a detailed architecture walkthrough. The key modules:

| Module | Responsibility |
|--------|---------------|
| `explorer.ts` | Orchestrates source resolution, LLM loop, tool execution |
| `llm/provider.ts` | Unified interface for Gemini, Anthropic, OpenAI, OpenRouter |
| `detect.ts` | Identifies project type from config files |
| `prompts.ts` | System prompts for 4 exploration modes |
| `output.ts` | Parses structured LLM responses, extracts Mermaid diagrams |
| `interactive.ts` | REPL for follow-up questions |
| `tools/*` | File system tools (tree, read, grep, glob) |
| `remote/*` | GitHub/GitLab API and git clone support |

## Adding a New LLM Provider

1. Add a class implementing `LLMProvider` in `src/llm/provider.ts`
2. Add an entry to `MODEL_ALIASES` and `KNOWN_PRICING`
3. Add a case to `detectProvider()` and `createProvider()`
4. Add tests in `tests/llm-provider.test.ts`

## Adding a New Project Type

1. Add a fixture directory in `tests/fixtures/`
2. Add detection logic in `src/detect.ts`
3. Add focus areas in `buildFocusAreas()`
4. Add tests in `tests/detect.test.ts`

## Adding an Exploration Mode

1. Add the mode name to the `ExplorationMode` type in `src/prompts.ts`
2. Add a mode-specific prompt in `MODE_PROMPTS`
3. Update the `VALID_MODES` array in `src/index.ts`
4. Add tests in `tests/exploration.test.ts`

## Code Style

- Self-documenting code — clear names, no inline comments
- No docstrings or change-tracking comments
- TypeScript strict mode
- Imperative commit messages ("Add feature" not "Added feature")

## Environment Variables

At least one API key is required:

| Variable | Provider |
|----------|----------|
| `GEMINI_API_KEY` | Google Gemini (default) |
| `ANTHROPIC_API_KEY` | Anthropic Claude |
| `OPENAI_API_KEY` | OpenAI GPT |
| `OPENROUTER_API_KEY` | OpenRouter (DeepSeek, Mistral, etc.) |

Optional:
- `GITHUB_TOKEN` — for private repos and higher rate limits
- `GITLAB_TOKEN` — for private GitLab repos
