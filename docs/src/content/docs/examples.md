---
title: Examples
description: Explore complete Skillet skills from a small starter to full upstream conversions.
type: tutorial
summary: Compare source skills with their Skillet specs, rendered instructions, references, fixtures, and eval cases.
---

The repository includes three runnable examples under [`examples/`](https://github.com/getsentry/skillet/tree/main/examples).

## Commit Conventions

[`examples/commit-conventions`](https://github.com/getsentry/skillet/tree/main/examples/commit-conventions) is the smallest example. It contains:

- a two-behavior `spec.md`
- a compact `SKILL.md`
- deterministic and semantic eval checks

Start here when you want to see the artifact layout without a large reference library.

## Garfield

[`examples/garfield`](https://github.com/getsentry/skillet/tree/main/examples/garfield) converts the Garfield implementation-review skill from `dcramer/agents`.

The example keeps two views:

- [`original/`](https://github.com/getsentry/skillet/tree/main/examples/garfield/original) preserves the exact pinned upstream snapshot and license.
- The example root contains the Skillet-authored behavior spec, compact skill instructions, copied policy references, review fixture, and six eval cases.

Use this example to see how Skillet handles a coordination-heavy skill whose important behavior appears in subagent selection, finding triage, validation, and final handoff.

## Effect

[`examples/effect`](https://github.com/getsentry/skillet/tree/main/examples/effect) converts the Effect TypeScript guidance skill from `kitlangton/skills`.

The example also keeps two views:

- [`original/`](https://github.com/getsentry/skillet/tree/main/examples/effect/original) preserves the exact pinned upstream snapshot and license.
- The example root contains the Skillet-authored behavior spec, compact reference-driven skill, Effect application fixture, and eight semantic eval cases.

Use this example to see how a large technical guide can keep detailed reference material while the main skill stays short and task-oriented.

## Validate the Examples

From a Skillet repository checkout:

```bash
skillet validate examples/commit-conventions
skillet validate examples/garfield
skillet validate examples/effect

skillet eval examples/commit-conventions --dry
skillet eval examples/garfield --dry
skillet eval examples/effect --dry
```

The dry runs check that each case requires agent work without starting model-backed trials.
