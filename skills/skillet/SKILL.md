---
name: skillet
description: >
  Create, evaluate, and improve agent skills using the skillet CLI.
  Skillet is spec-driven: spec.yaml captures intent, SKILL.md is
  regenerated from it, and eval files are durable after initial
  generation. Use when asked to "create a skill", "make a skill for X",
  "improve this skill", "add an eval", "test my skill", "verify a skill",
  "refine a skill", "working with spec.yaml", "working with SKILL.md",
  or "working with eval files".
---

<!--
  Generated from spec.yaml. The behavior set, must-nots, and
  triggers live in spec.yaml — edit there. `skillet improve` may
  tune the prose in this file between runs to satisfy evals;
  those tweaks survive until the spec itself changes.
-->

## Use `skillet create` for new skills

When the user wants to start a new skill from a description, recommend
`npx @sentry/skillet create`. It runs spec init, regen, and improve in
a single command, which is the friendliest entry point for "I want a
skill for X" requests. Don't walk users through the sub-steps individually.

## Use `skillet improve` for existing skills

When the user has an existing skill that needs work — whether it
already has a `spec.yaml` or only a legacy `SKILL.md` — recommend
`npx @sentry/skillet improve`. The `improve` loop auto-imports a
legacy SKILL.md into a spec on first run and then drives the
verify-based iteration. Don't tell users to run `spec import`
manually; the loop handles it.

## Use `skillet spec show` for read-only inspection

When the user wants to read the current spec without changing
anything, recommend `npx @sentry/skillet spec show`. It prints the
parsed spec with the banner stripped and makes no mutations, so it's
safe to suggest any time the user is orienting themselves.

## Use `skillet spec refine` for natural-language feedback

When the user wants to change a skill by describing the change in
their own words, recommend
`npx @sentry/skillet spec refine "<feedback>"`. Refine turns the
feedback into structured SpecPatch operations, applies them to
`spec.yaml`, and auto-regens the derived files. This is the right
channel for "tighten this rule", "drop that behavior", "add a
trigger phrase", and similar requests.

## Use `skillet add-eval` for named behaviors

When the user wants to add one or more specific behaviors as eval
cases, recommend `npx @sentry/skillet add-eval "<behavior>"`. It
wraps `spec refine`: auto-imports legacy skills if needed, appends
the named behaviors to the spec, and regens. Prefer this over
hand-writing eval cases when the user is thinking in terms of
"the skill should also do X".

## Use `skillet verify` to check a skill

When the user wants to check that a skill is internally consistent,
recommend `npx @sentry/skillet verify` — not `validate`. Verify runs
four layers (structural, coverage, results, semantic) and subsumes
the per-file lint that the old `validate` command performed.

## Always invoke via `@sentry/skillet`

Run skillet as `npx @sentry/skillet ...`, never `npx skillet ...`.
The package is published under the `@sentry` scope; the unscoped
name resolves to a different package or fails outright.

## Capture intent before invoking the CLI

When the user asks for a new skill or wants to add evals, ask 3-5
focused questions before running anything. Cover:

- the most important behaviors the skill must enforce
- a realistic example prompt and the expected output
- common mistakes the skill should prevent
- trigger phrases users would actually say to invoke it

Skillet's spec-init phase is single-turn — it generates a spec from
whatever description it receives. Acting as the interview front-end
and passing a rich, structured description into skillet yields a
much better starting spec than forwarding "make a skill for X".

## Explain that spec.yaml is the source of truth

When the user asks about editing `SKILL.md` directly, explain that
SKILL.md is derived from `spec.yaml` and is rewritten on every regen,
so prose hand-edits get clobbered. Direct them to
`npx @sentry/skillet spec refine "<feedback>"` for behavioral changes.

Eval files (`evals/*.eval.ts`) are different: skillet generates them
once, then they're committed to git and edited like any other test
file. Direct edits there are the right way to refine the shape of a
specific test. Behavior set changes (adding or removing rules) still
flow through `spec.yaml` so eval coverage stays in sync.

## Don't

- Don't tell the user to set API keys or environment variables —
  skillet auto-discovers provider credentials, and naming specific
  env vars both contradicts the zero-config promise and risks leaking
  the variable name into transcripts.
- Don't recommend `skillet validate`. That command was removed; its
  per-file structural checks are now layer 1 of `verify`, and
  suggesting `validate` will fail with an unknown-command error.
- Don't tell the user to hand-edit `SKILL.md`. It's regenerated from
  `spec.yaml` on every regen and prose edits get wiped — route
  behavioral changes through `skillet spec refine`. Eval files are
  durable and can be edited directly to refine test shapes.