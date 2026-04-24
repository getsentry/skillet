---
name: skillet
description: >
  Use the skillet CLI to create, evaluate, improve, and validate agent skills.
  Use when asked to "create a skill", "make a skill for X", "evaluate my skill",
  "run evals", "improve this skill", "validate the skill", or when working with
  SKILL.md files and eval YAML.
---

# Skillet CLI

Skillet creates, evaluates, and improves agent skills. Install and run via npx:

```
npx skillet <command>
```

Credentials are auto-discovered — do not prompt the user for API keys.

## Setup

Install the skillet skill into your agent (auto-detects Claude Code, OpenCode, Pi):

```
npx skillet install
```

Or specify a custom skill directory:

```
npx skillet install ~/.my-agent/skills
```

## Commands

| Intent | Command |
|--------|---------|
| New skill from a description | `npx skillet create "description"` |
| Improve an existing skill | `npx skillet improve [path]` |
| Run eval cases | `npx skillet eval [path]` |
| Add eval cases from descriptions | `npx skillet add-eval [path] "behavior"` |
| Structural lint (no LLM) | `npx skillet validate [path]` |
| Install skill into agent | `npx skillet install [path]` |

## create

Generates SKILL.md + evals from a description, runs evals, iterates until passing.

```
npx skillet create "Django N+1 query reviewer" [--path=./my-skill] [--max-iterations=3]
```

Errors if SKILL.md already exists at the target path. Use `improve` instead.

## improve

Reads existing SKILL.md, generates or adds evals, refines the skill, iterates.

```
npx skillet improve [path] [--max-iterations=3]
```

Errors if no SKILL.md found. Use `create` instead.

## eval

Runs all `evals/**/*.eval.yaml` cases and reports results. No modifications.

```
npx skillet eval [path]          # Pretty output
npx skillet eval [path] --json   # Structured JSON
```

Exit code 0 if all pass, 1 if any fail.

## add-eval

Generates eval cases from natural-language behavior descriptions and appends them to the eval file.

```
npx skillet add-eval "should greet by name when name is provided"
npx skillet add-eval ./my-skill "handles empty input" "errors on missing file"
npx skillet add-eval "rejects invalid YAML" --file=edge-cases.eval.yaml
```

Multiple descriptions generate one eval case each. Appends to existing eval files.

## validate

Fast structural check — no LLM calls. Verifies frontmatter, required fields, eval YAML.

```
npx skillet validate [path]          # Pretty output
npx skillet validate [path] --json   # Structured JSON
```

Always run before `eval` to catch cheap errors first.

## Workflow

**New skill:**
1. `npx skillet create "what the skill does"` — generates everything and iterates

**Fix a failing skill:**
1. `npx skillet eval --json` — get structured failures
2. Edit SKILL.md or eval YAML based on failures
3. `npx skillet eval` — verify fixes

**Quick check:**
1. `npx skillet validate` — catches frontmatter/structure issues in <1s
