---
name: code-explorer
description: Explore a codebase and answer questions with file references using LLM-powered analysis
invocation: user
---

# Code Explorer

Explore codebases (local or remote) and answer questions with accurate file:line references.

## Usage

```
/code-explorer <source> "<question>"
```

## Examples

```bash
# Local directory
/code-explorer ./src "How does authentication work?"

# GitHub repo (uses API - no clone needed)
/code-explorer github:anthropics/claude-code "How does the CLI parse arguments?"

# GitLab repo
/code-explorer gitlab:group/project "What testing framework is used?"

# Any git URL (shallow clones)
/code-explorer https://github.com/oven-sh/bun.git "How is the CLI structured?"
```

## Options

- `--model, -m`: LLM model (gemini or haiku, default: gemini)
- `--max-depth, -d`: Tree depth limit (default: 6)
- `--exclude, -e`: Additional patterns to exclude
- `--include, -i`: Additional patterns to include
- `--branch, -b`: Branch/tag/commit for remote repos
- `--verbose, -v`: Show exploration steps

## Environment Variables

- `GEMINI_API_KEY`: Required for Gemini model (default)
- `ANTHROPIC_API_KEY`: Required for Haiku model
- `GITHUB_TOKEN`: Optional, for private repos and higher rate limits
- `GITLAB_TOKEN`: Optional, for private GitLab repos

## Instructions

When the user invokes this skill, run the code-explorer CLI:

```bash
~/dev/code-explorer/bin/code-explorer <source> "<question>" [options]
```

Parse the user's input to extract the source path/URL, question, and any options.

The tool will:

1. Generate a filtered directory tree
2. Use an LLM to explore relevant files
3. Return an answer with file:line references

Return the full output to the user.
