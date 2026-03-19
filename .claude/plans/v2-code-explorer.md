# Code Explorer v2 — Implementation Plan

## Vision
Transform code-explorer from "generic LLM + file tools" into an **instant codebase consultant** — the "Google Maps for codebases."

## Implementation Order (TDD)

| # | Proposal | Status | Tests | Commit |
|---|----------|--------|-------|--------|
| 1 | Expert System Prompt + 4 Exploration Modes | DONE | 10 | 2dcad2e |
| 2 | Unified LLM Provider + Multi-Model + OpenRouter | DONE | 19 | e3757bd |
| 3 | Streaming Output + Progress Indicators | PARTIAL (verbose mode only) | - | a8c6042 |
| 4 | Mermaid Diagrams + Interactive targets (mermaid.live/excalidraw/html) | DONE | 13 | a0b395f |
| 5 | Structured Output Format | DONE | incl. in #4 | a0b395f |
| 6 | Auto-Detect Project Type + Tailored Strategy | DONE | 12 | 8c3dcab |
| 7 | Follow-Up / Interactive REPL | TODO | - | - |
| 8 | --save Export to Markdown | DONE (CLI wired) | - | a8c6042 |
| 9 | Parallel Tool Execution (Promise.all) | DONE | - | a8c6042 |
| 10 | Cost Estimate + Token Tracking | DONE | - | a8c6042 |
| 11 | SKILL.md Rewrite (CSO-Optimized) | DONE | - | 35f41ff |
| 12 | Test Suite | IN PROGRESS (54 tests) | 54 | multiple |

## Remaining Work

### Must Do
- [ ] Interactive REPL mode (`--interactive` flag, readline loop, /diagram /save /quit commands)
- [ ] True streaming (SSE/chunked API responses, token-by-token final answer)
- [ ] Edge case tests (empty repos, binary-only repos, very large trees, API errors)
- [ ] Integration test with real fixture repo (end-to-end CLI execution)

### Nice to Have
- [ ] `@excalidraw/mermaid-to-excalidraw` for proper Excalidraw conversion (currently just base64 deep link)
- [ ] Smart token budgeting (warn when approaching limits, summarize efficiently)
- [ ] Auto-detect language/framework from deeper signals (imports, decorators)
- [ ] Result caching for repeated exploration of same repo

## Model Roster

| Provider | Model ID | Alias | Cost (in/out per 1M) |
|---|---|---|---|
| Gemini | gemini-3-flash-preview | flash | $0.50 / $3.00 |
| Anthropic | claude-sonnet-4-6 | sonnet | $3.00 / $15.00 |
| Anthropic | claude-haiku-4-5-20251001 | haiku | $1.00 / $5.00 |
| OpenAI | gpt-5.4-mini | gpt5 | $0.75 / $4.50 |
| OpenAI | gpt-5.4 | gpt5-full | $2.50 / $15.00 |
| DeepSeek (OpenRouter) | deepseek/deepseek-v3.2 | deepseek | $0.26 / $0.38 |
| OpenRouter | any model ID | passthrough | varies |

## Architecture After v2

```
src/
├── index.ts         # CLI (commander, --model/--mode/--diagram/--save/--json)
├── explorer.ts      # Orchestration (source context, tool loop, parallel execution)
├── detect.ts        # Project detection (Node/Python/Go/Rust/Rails/React/monorepo)
├── filter.ts        # File filtering (.gitignore, defaults, binary, size)
├── output.ts        # Structured output parsing, Mermaid extraction, terminal formatting
├── prompts.ts       # Expert system prompts (architecture/trace/onboard/search)
├── llm/
│   └── provider.ts  # Unified LLMProvider (Gemini, Anthropic, OpenAI, OpenRouter)
├── tools/           # tree, read, grep, glob
└── remote/          # github, gitlab, clone
```
