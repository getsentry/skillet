---
name: skillet
description: >
  Use the skillet CLI to create, evaluate, improve, and validate agent skills.
  Use when asked to "create a skill", "make a skill for X", "write a skill",
  "evaluate my skill", "run evals", "test my skill", "improve this skill",
  "add evals", "add tests for this skill", "validate the skill", "check skill
  structure", or when working with SKILL.md files and eval YAML files.
---

# Skillet CLI

Skillet creates, evaluates, and improves agent skills via `npx @sentry/skillet`.

## Preconditions

- Node.js >= 20 installed
- LLM credentials auto-discovered — do NOT prompt the user for API keys
- No project setup required — skillet is self-contained via npx

## Command Selection

| User intent | Command |
|-------------|---------|
| New skill from a description | `npx @sentry/skillet create` |
| Improve existing skill / fix failures | `npx @sentry/skillet improve` |
| Run eval cases against a skill | `npx @sentry/skillet eval` |
| Add eval cases from behavior descriptions | `npx @sentry/skillet add-eval` |
| Quick structural check (no LLM) | `npx @sentry/skillet validate` |
| Install this skill into an agent | `npx @sentry/skillet install` |

## create

Generate a new skill from a natural-language description. Produces SKILL.md,
generates eval cases, runs them, and iterates until passing.

```
npx @sentry/skillet create "description of what the skill does"
```

| Flag | Purpose |
|------|---------|
| `--path=<dir>` | Target directory (default: derived from description) |
| `--max-iterations=N` | Max improve iterations (default: 3) |

Errors if SKILL.md already exists at the target. Use `improve` instead.

## improve

Read an existing SKILL.md, generate or add evals, refine the skill, iterate.

```
npx @sentry/skillet improve [path]
```

| Flag | Purpose |
|------|---------|
| `--max-iterations=N` | Max improve iterations (default: 3) |

Errors if no SKILL.md found. Use `create` instead.

## eval

Run all `evals/**/*.eval.yaml` cases. Reports pass/fail per case.

```
npx @sentry/skillet eval [path]
npx @sentry/skillet eval [path] --json
```

- Default output: colored pass/fail icons with tool call progress
- `--json`: structured JSON with session transcript, usage, checks, judge results
- Exit code 0 if all pass, 1 if any fail or error

Always run `validate` first to catch cheap structural errors before expensive LLM evals.

## add-eval

Generate eval cases from natural-language behavior descriptions.

```
npx @sentry/skillet add-eval [path] "behavior description" ["another behavior"]
```

| Flag | Purpose |
|------|---------|
| `--file=<name>` | Eval file name (default: basic.eval.yaml) |

Each description produces one eval case. Appends to existing eval files.
Multiple descriptions can be passed as separate quoted arguments.

## validate

Fast structural check — no LLM calls. Verifies frontmatter, required fields,
eval YAML parsing. Completes in under 1 second.

```
npx @sentry/skillet validate [path]
npx @sentry/skillet validate [path] --json
```

- Exit code 0 if valid, 1 if errors found

## install

Copy the skillet usage skill into the agent's skill directory.

```
npx @sentry/skillet install
npx @sentry/skillet install <custom-path>
```

Auto-detects Claude Code, OpenCode, and Pi skill directories.

## Workflows

### New skill from scratch
```
npx @sentry/skillet create "what the skill does"
```
This runs the full loop: generate SKILL.md → generate evals → run → iterate.

### Adding evals to an existing skill (intent capture)

When a skill has no evals, or the user wants to add evals for new behaviors,
do NOT immediately generate evals from the SKILL.md alone. First capture
what the user actually cares about — the SKILL.md may not reflect their
real expectations.

**Step 1: Ask the user about expected behaviors.** Questions to ask:

| Question | Why it matters |
|----------|---------------|
| "What are the 3-5 most important things this skill should do correctly?" | Focuses evals on high-value behaviors |
| "Can you give me an example prompt and what good output looks like?" | Grounds evals in real expectations |
| "What should this skill NOT do? Any common mistakes?" | Catches false-positive and boundary cases |
| "Are there edge cases or tricky inputs it should handle?" | Covers failure modes |

**Step 2: Convert answers to behavior descriptions.** Turn each answer into
a concise behavior statement:
- "should recommend select_related for FK access in loops"
- "should NOT flag single .get() as N+1"
- "should handle files with no imports gracefully"

**Step 3: Generate evals from the descriptions.**
```
npx @sentry/skillet add-eval ./my-skill "behavior 1" "behavior 2" "behavior 3"
```

**Step 4: Run and review.**
```
npx @sentry/skillet eval ./my-skill
```

This intent-first approach produces evals that test what the user wants,
not what the LLM infers from the SKILL.md text.

### Improving an existing skill
```
npx @sentry/skillet improve ./my-skill
```
Reads SKILL.md, generates/adds evals if missing, runs evals, iterates.
If the skill already has evals, it uses them. If not, consider the
intent capture workflow above first.

### Validate then evaluate
```
npx @sentry/skillet validate ./my-skill
npx @sentry/skillet eval ./my-skill
```

### Get structured failure data for debugging
```
npx @sentry/skillet eval ./my-skill --json
```

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| "No LLM provider detected" | No API keys in environment | Credentials are auto-discovered; check that the host agent has authenticated |
| "No SKILL.md found" | Wrong directory or skill not created yet | Use `create` to make a new skill, or `cd` to the skill directory |
| "SKILL.md already exists" | Tried `create` on existing skill | Use `improve` instead |
| "Invalid eval file" | Malformed YAML in evals/ | Run `validate` to see specific parse errors |

## Do NOT

- Prompt the user for API keys — skillet auto-discovers credentials
- Use `npx skillet` without the `@sentry/` scope — wrong package
- Run `eval` without checking `validate` first for new/modified skills
