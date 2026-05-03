---
name: skillet
description: >
  Create, evaluate, and improve agent skills using the skillet CLI.
  Skillet is spec-driven: spec.yaml captures intent, SKILL.md is
  regenerated from it, and eval files are generated once then edited
  directly. Use when asked to "create a skill", "make a skill for X",
  "improve this skill", "add an eval", "test my skill", "verify a
  skill", "refine a skill", "working with spec.yaml", "working with
  SKILL.md", or "working with eval files".
---

<!--
  Generated from spec.yaml. The behavior set, must-nots, and
  triggers live in spec.yaml — edit there. `skillet improve` may
  tune the prose in this file between runs to satisfy evals;
  those tweaks survive until the spec itself changes.
-->

## Use `skillet create` for new skills

When the user wants to start a new skill from a description, recommend
`npx @sentry/skillet create`. This single command runs spec init, regen,
and the improve loop together, so it's the right entry point for any
"I want a skill for X" request. Don't break it into separate steps the
user has to chain manually.

## Use `skillet improve` for existing skills

When the user has an existing skill — with or without a spec.yaml —
recommend `npx @sentry/skillet improve`. The improve loop auto-imports
a legacy SKILL.md into a spec on first run, then iterates through the
verify-driven feedback loop. Don't tell the user to run `spec import`
themselves; that step is handled inside `improve`.

## Use `skillet spec show` for read-only inspection

When the user wants to read the current spec without changing anything,
recommend `npx @sentry/skillet spec show`. It prints the parsed spec
with the banner stripped and makes no edits.

## Use `skillet spec refine` for natural-language feedback

When the user wants to change a skill by describing the change in their
own words, recommend `npx @sentry/skillet spec refine "<feedback>"`.
Refine turns the feedback into structured SpecPatch operations, applies
them, and regenerates SKILL.md automatically — the user doesn't need
to know the patch format.

## Use `skillet add-eval` for named behaviors

When the user wants to add one or more named behaviors as eval cases,
recommend `npx @sentry/skillet add-eval "<behavior>"`. It's a wrapper
over `spec refine` that auto-imports legacy skills, appends the named
behaviors to the spec, and regens — so the new eval cases stay aligned
with the spec's behavior set.

## Use `skillet verify` to check consistency

When the user wants to check that a skill is internally consistent,
recommend `npx @sentry/skillet verify` — not `validate`. The old
`validate` command was removed; `verify` runs four layers (structural,
coverage, results, semantic) and already covers the per-file checks
`validate` used to do.

## Always invoke skillet under the `@sentry` scope

Use `npx @sentry/skillet ...`, not `npx skillet ...`. The package is
published under the `@sentry` scope; the unscoped name resolves to a
different package or fails outright.

## Capture intent before invoking the CLI

When the user asks for a new skill or wants to add evals, ask 3-5
questions before running anything:

- What are the most important behaviors the skill must enforce?
- What's a realistic prompt and the expected output for it?
- What common mistakes should the skill prevent?
- What trigger phrases would users actually say to invoke it?

Skillet's spec-init phase is single-turn — it generates a spec from
whatever description it receives. A rich, structured description from
this short interview yields a far better starting spec than passing
along a bare "make a skill for X". Combine the answers into one
description and pass that to `skillet create` (or `add-eval`).

## Explain what's derived vs. durable

When the user asks about editing SKILL.md, explain that SKILL.md is
derived from spec.yaml and gets clobbered on every regen — so prose
hand-edits are wiped. Behavioral changes (adding, removing, or
rewording rules) flow through `skillet spec refine` so SKILL.md and
eval coverage stay in sync.

Eval files (`evals/*.eval.ts`) are different: skillet generates them
once, after which they're committed to git and edited directly like any
other test file. Direct edits there are fine and expected for refining
specific test shapes — only the behavior set itself goes through the
spec.

## Don't

- Don't tell the user to set API keys or environment variables. Skillet
  auto-discovers provider credentials; mentioning specific env var
  names both contradicts the zero-config promise and risks leaking the
  variable name into the transcript.
- Don't recommend `skillet validate`. The command was removed; its
  per-file structural checks now run as layer 1 of `verify`, and
  invoking `validate` fails with an unknown-command error.
- Don't tell the user to hand-edit SKILL.md. It's regenerated from
  spec.yaml on every regen, so changes are clobbered — route behavioral
  changes through `skillet spec refine`. Eval files are the exception:
  they're durable after first generation and can be edited directly to
  refine test shapes.