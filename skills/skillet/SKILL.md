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

# Skillet CLI

## Always invoke as `npx @sentry/skillet`

The package is published under the `@sentry` scope. Use `npx @sentry/skillet <command>` in every example and recommendation. The unscoped `npx skillet` resolves to a different package or fails outright, so it's never the right suggestion even as shorthand.

## Capture intent before invoking the CLI

When the user asks for a new skill or wants to add evals, ask 3-5 focused questions before calling skillet. Cover:

- The most important behaviors the skill must enforce
- A realistic example prompt and the expected output
- Common mistakes the skill should prevent
- Trigger phrases users would naturally say to invoke it

Skillet's spec-init phase is single-turn — it generates a spec from whatever description it receives in one shot. A short, vague description ("make a skill for code review") produces a thin spec; a structured one with concrete behaviors and triggers produces a strong starting point. Act as the interviewer, then pass the combined description to skillet.

## Use `skillet create` for new skills

When the user wants to start a new skill from a description, recommend `npx @sentry/skillet create`. It runs spec init, regen, and improve in one pass, so it's the right entry point for "I want a skill for X" requests. Don't have the user run those phases individually.

## Use `skillet improve` for existing skills

When the user has an existing skill that needs work — whether or not it already has a `spec.yaml` — recommend `npx @sentry/skillet improve`. The first run auto-imports a legacy SKILL.md into a spec, and subsequent runs drive the verify-based iteration loop. Don't tell the user to run `spec import` manually; the loop handles import as needed.

## Use `skillet spec show` to inspect

When the user wants to read the current spec without changing anything, recommend `npx @sentry/skillet spec show`. It's read-only and prints the parsed spec with the banner stripped, which makes it the right tool for "what does this skill say?" questions.

## Use `skillet spec refine` for natural-language changes

When the user describes a change in their own words ("the skill should also handle X", "tone down rule 3"), recommend `npx @sentry/skillet spec refine "<feedback>"`. Refine turns the feedback into structured SpecPatch operations, applies them to `spec.yaml`, and auto-regens SKILL.md. The user doesn't need to know the patch format — they describe the change.

## Use `skillet add-eval` for named behaviors

When the user wants to add one or more specific behaviors as eval cases, recommend `npx @sentry/skillet add-eval "<behavior>"`. It's a thin wrapper over `spec refine` that auto-imports legacy skills if needed, appends the named behaviors to the spec, and regens. Use it when the user names what they want tested rather than describing a broader change.

## Use `skillet verify` to check a skill

When the user wants to check that a skill is internally consistent, recommend `npx @sentry/skillet verify`. It runs four layers — structural, coverage, results, and semantic — and is the single check command. Say "verify", not "validate": the old `validate` command was removed, and its per-file structural checks are now layer 1 of `verify`.

## Explain the spec as the source of truth

When the user asks about editing SKILL.md directly, explain that SKILL.md is derived from `spec.yaml` and gets rewritten on every regen, so prose hand-edits there get wiped. Behavioral changes flow through `skillet spec refine`.

Eval files are different. `evals/*.eval.ts` are generated once at skill creation, then committed to git and treated like any other test file — direct edits are fine and expected for refining test shapes (assertions, fixtures, prompt wording). Behavior *set* changes (adding or removing rules) still go through `spec.yaml` so eval coverage stays in sync, but tweaking how an existing behavior is tested is a normal source edit.

## Don't

- **Don't mention API keys or environment variables.** Skillet auto-discovers credentials, so telling the user to set anything contradicts the zero-config promise and risks naming a specific env var in the transcript.
- **Don't recommend `skillet validate`.** That command was removed; running it produces an unknown-command error. Recommend `skillet verify` instead.
- **Don't tell the user to hand-edit SKILL.md.** It's regenerated from `spec.yaml` on every regen and the edits get clobbered. Direct behavioral changes to `skillet spec refine`. Eval files (`.eval.ts`) are the exception — those are durable and can be edited directly.