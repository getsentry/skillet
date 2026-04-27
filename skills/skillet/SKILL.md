---
name: skillet
description: >
  Create, evaluate, and improve agent skills using the skillet CLI.
  Use when asked to "create a skill", "make a skill for X", "improve
  this skill", "add an eval", "test my skill", "verify a skill",
  "refine a skill", or when working with `spec.yaml`, `SKILL.md`, or
  eval YAML files.
---

# Skillet

Skillet is a spec-driven CLI for authoring agent skills. The source
of truth for every skill is `spec.yaml` — a structured file capturing
intent, behaviors, must-nots, and triggers. SKILL.md and eval YAMLs
are derived from the spec; iteration patches the spec rather than
the prose.

Run via `npx @sentry/skillet <command>`. Credentials are auto-discovered —
never prompt the user for API keys.

## Choosing the right command

| User goal | Command |
|-----------|---------|
| Start a new skill from a description | `skillet create "<description>"` |
| Make an existing skill pass evals | `skillet improve [path]` |
| View the current spec | `skillet spec show [path]` |
| Edit the spec via natural-language feedback | `skillet spec refine "<feedback>" [path]` |
| Migrate a legacy SKILL.md into a spec | `skillet spec import [path]` |
| Generate a spec without iterating | `skillet spec init "<description>"` |
| Add one or more behaviors as evals | `skillet add-eval [path] "<behavior>"` |
| Check spec/SKILL.md/evals agree | `skillet verify [path] [--semantic]` |
| Run evals once | `skillet eval [path] [--json]` |
| Install skillet's skill into your agent | `skillet install [path]` |

## Capturing intent before generation

When a user asks for a new skill or wants to improve an existing one,
do not jump straight to `skillet create` or `skillet improve` with a
one-line description. Skillet's spec-init phase is single-turn — it
takes whatever description it receives and emits a spec immediately.
The richer the input, the better the spec.

Before invoking the CLI, gather the high-value information by asking
the user:

| Ask | Because |
|-----|---------|
| What are the 3-5 most important things this skill must do correctly? | Becomes the initial `behaviors[]` |
| Show me one realistic prompt and what good output looks like. | Grounds eval cases in real expectations |
| What should this skill NOT do? Common mistakes to flag? | Becomes `must_not[]` entries (negative cases) |
| What phrases would users say to trigger this? | Becomes `triggers.should[]` |
| What near-miss phrases should NOT trigger it? | Becomes `triggers.should_not[]` |

Combine the answers into a single rich description and pass it to
`skillet create "<combined description>"` (or `skillet spec init`
if the user wants to inspect the spec before iterating).

For an existing skill the user wants to improve, ask the equivalent
questions (what behaviors are they unsure about? what's the worst
recent failure?) and translate them into `skillet spec refine` calls
or `skillet add-eval` invocations targeting specific gaps.

## The spec-driven loop

`skillet improve` runs:

1. Establish the spec (load existing, or auto-import from a legacy
   SKILL.md if no `spec.yaml` exists).
2. Regenerate `SKILL.md` and `evals/*.eval.yaml` from the spec.
3. Verify coverage — every behavior has at least one eval case.
4. Run the evals.
5. Verify per-behavior results — every behavior has a passing case.
6. If anything failed, the assessor produces structured patches
   (`update_behavior`, `update_eval`, `add_behavior`, etc.) and the
   spec is updated. Loop back to step 2.
7. Terminate when verification is green or max iterations hits.

Termination is conditioned on per-behavior verification, not raw
eval pass/fail counts. A skill where all eval cases pass but some
behavior has no case is NOT considered done — the loop catches that.

## What "spec is the source of truth" means in practice

- `spec.yaml` opens with a banner saying "do not edit by hand".
  Tell the user the same thing if they ask: spec changes flow through
  `skillet spec refine` (LLM-assisted), `skillet add-eval` (one
  behavior at a time), or `skillet spec import` (one-time migration).
- `SKILL.md` and `evals/*.eval.yaml` carry derived-file banners.
  Hand edits to these are wiped on the next regen. If the user has
  edited SKILL.md by hand, suggest `skillet spec refine` to push the
  change into the spec instead.
- Every behavior has a kebab-case ID (e.g. `flag-n-plus-one`). Eval
  cases are named `<id>__<slug>` and tagged `tests_behavior: <id>`.
  Verification uses these as join keys.

## Verify before claiming done

Run `skillet verify` after any spec change. Layer 1 (structural)
catches malformed YAML. Layer 2 catches missing eval coverage and
orphan cases. Layer 3 (when run results are available) catches
behaviors with only failing or skipped cases. Layer 4 (`--semantic`,
opt-in, costs an LLM call) catches SKILL.md that fails to encode a
behavior the spec lists.

`skillet improve` runs layers 1-3 in the loop, so a successful
improve invocation guarantees the same coverage `verify` would
report. The standalone `verify` command is for CI, manual checks,
or running `--semantic` after a long iteration.

## Rules

- Always use the `@sentry/` scope: `npx @sentry/skillet`, not `npx skillet`.
- Never mention API keys or environment variables to the user — credentials
  are auto-discovered.
- Never tell the user to hand-edit `spec.yaml`, `SKILL.md`, or eval
  YAMLs. Use the appropriate `skillet` command instead.
- For an existing skill that has a `SKILL.md` but no `spec.yaml`,
  `skillet improve` and `skillet add-eval` auto-import — no separate
  migration step required.
