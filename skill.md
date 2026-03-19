---
name: code-explorer
description: Use when exploring an unfamiliar codebase, understanding architecture, tracing request flows, onboarding to a new project, or finding specific code patterns across local directories, GitHub repos, GitLab repos, or git URLs
invocation: user
---

# Code Explorer

Explore any codebase and get structured answers with file:line citations and Mermaid diagrams.

## Usage

```bash
~/dev/code-explorer/bin/code-explorer <source> "<question>" [options]
```

## Quick Examples

```bash
/code-explorer . "How does authentication work?"
/code-explorer github:anthropics/claude-code "How is the CLI structured?"
/code-explorer . "Trace a payment request end-to-end" --mode trace
/code-explorer . "What do I need to know to contribute?" --mode onboard
```

## Modes

| Mode | When to use |
|------|------------|
| `architecture` | Understanding system design, module boundaries, dependencies (default) |
| `trace` | Following a request/data flow end-to-end |
| `onboard` | Getting up to speed on a new project |
| `search` | Finding specific code, patterns, or functionality |

## Model Aliases

`flash` (Gemini 3 Flash), `sonnet` (Claude Sonnet 4.6), `haiku` (Claude Haiku 4.5), `gpt5` (GPT-5.4 Mini), `deepseek` (DeepSeek V3.2), or any full model ID.

## Key Options

- `--model, -m`: Model alias or ID (default: flash)
- `--mode`: Exploration mode (default: architecture)
- `--diagram`: Open diagram in browser (mermaid, excalidraw, html)
- `--save, -s`: Save exploration as markdown
- `--json`: JSON output
- `--verbose, -v`: Show tool calls live

## Instructions

Parse user input to extract source, question, and options. Run the CLI. Return the full output.

Requires at least one API key: `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `OPENROUTER_API_KEY`.
