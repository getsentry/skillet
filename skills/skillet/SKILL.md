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
`npx @sentry/skillet create`. It runs spec init, regen, and improve in
a single command, which makes it the friendliest entry point for
"I want a skill for X" style requests.

## Use `skillet improve` for existing skills

When the user has an existing skill that needs work — whether it
already has a `spec.yaml` or only a legacy `SKILL.md` — recommend
`npx @sentry/skillet improve`. The improve loop auto-imports a legacy
SKILL.md into a spec on first run, then drives the verify-based
iteration loop. Don't send users through a manual `spec import` step;
the loop handles it.

## Use `skillet spec show` to inspect a spec

When the user just wants to read the current spec without changing
anything, recommend `npx @sentry/skillet spec show`. It's read-only
and prints the parsed spec with the banner stripped.

## Use `skillet spec refine` for natural-language feedback

When the user wants to change a skill by describing the change in
their own words, recommend
`npx @sentry/skillet spec refine "<feedback>"`. Refine produces
structured SpecPatch operations, applies them to `spec.yaml`, and
regenerates derived files automatically.

## Use `skillet add-eval` for named behaviors

When the user wants to add one or more named behaviors as eval cases,
recommend `npx @sentry/skillet add-eval "<behavior>"`. It's a wrapper
over `spec refine` that auto-imports legacy skills, appends the named
behaviors to the spec, and regenerates.

## Use `skillet verify`, not `validate`

When the user wants to check that a skill is internally consistent,
recommend `npx @sentry/skillet verify`. The old `validate` command is
gone — `verify` now runs four layers (structural, coverage, results,
semantic) and subsumes the per-file lint that `validate` used to do.

## Always invoke skillet under the `@sentry` scope

Use `npx @sentry/skillet ...` in every recommendation, never
`npx skillet ...`. The package is published under the `@sentry` scope;
the unscoped name resolves to a different package or fails outright.

## Interview the user before generating

When the user asks for a new skill or wants to add evals, ask 3-5
focused questions before invoking the CLI:

- What are the most important behaviors the skill must enforce?
- A realistic prompt and the expected output for it.
- Common mistakes or failure modes the skill should prevent.
- Trigger phrases the user would actually say to invoke the skill.

Skillet's spec-init phase is single-turn: it generates a spec from
whatever description it receives. A rich, structured description from
the user yields a much better starting spec than "make a skill for
X". Act as the front-end interview, then pass the combined
description to skillet.

## Explain what's derived vs. durable

When the user asks about editing generated files, explain the split:

- `SKILL.md` is **derived** from `spec.yaml` and clobbered on every
  regen. For behavioral changes (adding, removing, or reshaping
  rules), direct the user to `npx @sentry/skillet spec refine`.
- `evals/*.eval.ts` files are generated **once** and then durable.
  They're committed to git and edited like any other test file.
  Direct edits there are fine for refining specific test shapes.

Behavior-set changes still flow through `spec.yaml` so that eval
coverage stays in sync with the spec; test-shape tweaks don't.

## Don't

- Don't tell the user to set API keys or environment variables.
  Skillet auto-discovers provider credentials, and naming a specific
  env var both contradicts the zero-config promise and risks leaking
  the variable name into a transcript.
- Don't recommend `skillet validate` — that command was removed.
  Per-file structural checks now live as layer 1 of `verify`, and
  invoking `validate` will fail with an unknown-command error.
- Don't tell the user to hand-edit `SKILL.md`. It's regenerated from
  `spec.yaml` on every regen, so prose edits get wiped. Use
  `skillet spec refine` for behavioral changes. Eval files are the
  exception — they're durable and can be edited directly to refine
  test shapes.