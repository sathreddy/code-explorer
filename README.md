# code-explorer

CLI tool that explores codebases and answers questions with file:line references using LLM-powered analysis.

## Installation

```bash
bun install
bun run build
```

## Usage

```bash
# Local directory
code-explorer ./src "How does authentication work?"

# GitHub repo (uses API - no clone needed)
code-explorer github:anthropics/claude-code "How does the CLI parse arguments?"

# GitLab repo
code-explorer gitlab:group/project "What testing framework is used?"

# Any git URL (shallow clones)
code-explorer https://github.com/oven-sh/bun.git "How is the CLI structured?"
```

## Options

| Flag              | Description                        | Default     |
| ----------------- | ---------------------------------- | ----------- |
| `-m, --model`     | LLM model (gemini or haiku)        | gemini      |
| `-d, --max-depth` | Tree depth limit                   | 6           |
| `-e, --exclude`   | Additional patterns to exclude     | -           |
| `-i, --include`   | Additional patterns to include     | -           |
| `-b, --branch`    | Branch/tag/commit for remote repos | main/master |
| `-v, --verbose`   | Show exploration steps             | false       |

## Environment Variables

| Variable            | Required For                             |
| ------------------- | ---------------------------------------- |
| `GEMINI_API_KEY`    | Gemini model (default)                   |
| `ANTHROPIC_API_KEY` | Haiku model                              |
| `GITHUB_TOKEN`      | Private GitHub repos, higher rate limits |
| `GITLAB_TOKEN`      | Private GitLab repos                     |

## How It Works

1. **Phase 1: Overview** - Generates a filtered directory tree
2. **Phase 2: Exploration** - LLM explores files using read, grep, glob tools
3. **Phase 3: Answer** - Synthesizes answer with file:line references

## Claude Code Integration

Install as a skill:

```bash
cp skill.md ~/.claude/skills/code-explorer.md
```

Then use: `/code-explorer ./src "How does X work?"`
