# Plan-Driven Authoring

## Motivation

Skillet's `create` flow is a one-LLM-call-per-phase pipeline: a description goes
in, a spec comes out, generation runs. The most recent depth work added a
single-question human-facing interrupt and class-aware prompt guidance, but the
core loop still produces the spec in a single shot — there is no place for the
user to push back on scope, dimensions, examples, or boundaries before
generation commits to a shape.

In side-by-side use, getsentry/skills' `skill-writer` produces materially
deeper, more accurate skills. The structural reason is not prompt wording — it
is that skill-writer enforces *coverage gates before authoring*: it picks a
class, requires class-specific dimensions and transformed examples, and refuses
to proceed until those gates pass. The "planning" is interactive synthesis with
the user, not a one-shot LLM judgment.

Skillet should adopt the same shape, with one important simplification: we do
not introduce a separate "plan" artifact. The spec already represents the
authored contract; we expand it minimally and run an interactive *spec-author*
loop until depth gates pass.

## Change

Add a real interactive spec-authoring phase, gated by a small per-class depth
contract. Collapse the current `spec-init` and `spec-import` phases into a
single author loop with three seed strategies (description, existing skill,
improve transcripts). Delete the single-question `PhaseInterruptedForHumanInput`
escape hatch in favor of normal multi-turn dialogue. Backwards compatibility is
not preserved — there are few specs and they will be updated by hand.

## What Changes

- **`spec.yaml` gains exactly one new field: `class`.** Enum:
  `workflow` | `integration` | `security-review` | `authoring` | `generic`.
  Drives depth gates. Required.
- **Class definitions live in code**, not the spec. `src/spec/classes.ts`
  declares per-class required behavior dimensions and required reference
  artifacts (e.g., security-review must have positive-detection +
  false-positive-trap + remediation references).
- **New phase `spec-author`** replaces `spec-init` and `spec-import`. Multi-turn
  dialogue with the user. Cannot terminate until class-required depth gates
  pass on the spec under construction.
- **Three seed strategies** produce an initial spec draft for `spec-author`:
  description-only, from-existing-skill, from-improve-transcripts. All three
  feed the same author loop.
- **TTY-aware transport in the CLI.** Real readline-based question/answer in
  TTY mode; in non-TTY mode the loop pauses, persists a session file under
  the skill root, and exits with the questions. A new `skillet resume <path>
  --answer "..."` command hydrates the session and continues. This makes the
  flow workable for both humans and agent harnesses, which are the primary
  non-TTY consumers.
- **Deletions:** `src/authoring/phases/spec-init.ts`,
  `src/authoring/phases/spec-import.ts`, the
  `PhaseInterruptedForHumanInput` machinery, the empty `src/plan/` placeholder.
- **Authoring-time state stays in the conversation,** not the spec. Sources,
  decisions log, coverage matrix, and open questions are *not* persisted.
  Provenance can be added later via a sidecar `SOURCES.md`; not in scope here.

## Capabilities Touched

- `skill-authoring` — replaces phase set; adds class gates; adds seed strategies.
- `cli` — adds interactive transport contract.
- `skill-spec` — adds `class` field. (No canonical `skill-spec` spec.md exists
  yet; this change introduces one alongside the prior depth-and-reliability
  change which also adds requirements there.)

## Non-Goals

- Persisting provenance (sources, decisions, coverage matrix) on disk.
- Reverse-engineering specs for old skills that lack `class` — they get
  hand-updated.
- Replacing the `improve` loop. Improve-mode evals work and stay as-is; only
  its *seed path into spec-author* is unified with create.
