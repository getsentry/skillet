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

## Commands

| Intent | Command |
|--------|---------|
| New skill from a description | `npx skillet create "description"` |
| Improve an existing skill | `npx skillet improve [path]` |
| Run eval cases | `npx skillet eval [path]` |
| Structural lint (no LLM) | `npx skillet validate [path]` |

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
