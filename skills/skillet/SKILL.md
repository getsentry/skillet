---
name: skillet
description: >
  Add evals to agent skills and improve them using the skillet CLI. Use when
  asked to "add evals", "add tests", "evaluate my skill", "test my skill",
  "improve this skill", "create a skill", "make a skill for X", "validate
  the skill", or when working with SKILL.md and eval YAML files.
---

# Skillet

Skillet adds evaluations to agent skills and iteratively improves them.
Run via `npx @sentry/skillet <command>`. Credentials are auto-discovered —
never prompt for API keys.

## Adding Evals to an Existing Skill

This is the primary workflow. When a skill has no evals or needs better
coverage, capture what the user actually cares about before generating anything.

**1. Ask about expected behaviors:**

| Ask this | Because |
|----------|---------|
| What are the 3-5 most important things this skill must do correctly? | Focuses evals on high-value behaviors |
| Show me an example prompt and what good output looks like. | Grounds evals in real expectations |
| What should this skill NOT do? Common mistakes to catch? | Covers false-positive and boundary cases |
| Any edge cases or tricky inputs? | Covers failure modes |

**2. Convert answers to behavior descriptions:**
- "should recommend select_related for FK access in loops"
- "should NOT flag single .get() as N+1"
- "should handle files with no imports gracefully"

**3. Generate and run:**
```
npx @sentry/skillet add-eval ./my-skill "behavior 1" "behavior 2" "behavior 3"
npx @sentry/skillet eval ./my-skill
```

Do NOT skip the intent capture step. Generating evals from SKILL.md alone
misses what the user actually cares about.

## Improving a Skill

Run `npx @sentry/skillet improve [path]` to read the skill, generate or add
evals if missing, run them, and iterate until passing (default: 3 iterations).

If the skill has no evals yet, use the intent capture workflow above first —
`improve` generates evals from the SKILL.md text which may miss real intent.

## Creating a New Skill

Run `npx @sentry/skillet create "description"` to generate SKILL.md + evals
from scratch, run evals, and iterate. Use `--path=<dir>` to set the target.

## Command Reference

| Command | Purpose |
|---------|---------|
| `add-eval [path] "behavior" [...]` | Generate eval cases from behavior descriptions |
| `eval [path] [--json]` | Run evals, report pass/fail |
| `improve [path]` | Improve skill + evals iteratively |
| `create "description"` | Generate new skill from scratch |
| `validate [path] [--json]` | Structural check, no LLM (run before eval) |
| `install [path]` | Install skillet skill into agent |

## Rules

- Always `validate` before `eval` to catch cheap errors first
- Always use `@sentry/` scope: `npx @sentry/skillet`, not `npx skillet`
- Never prompt for API keys — credentials are auto-discovered
- Never generate evals without first asking what the user expects
