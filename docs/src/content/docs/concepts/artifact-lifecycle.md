---
title: Artifact Lifecycle
description: Understand the core spec-to-skill flow and its optional evaluation branch.
type: conceptual
summary: The specification defines behavior; runtime instructions are required, while eval cases are optional.
---

A Skillet skill is a directory of reviewable files. No Skillet command asks a model to generate those files internally.

```text
my-skill/
  spec.md
  SKILL.md
  references/
  evals/       # optional
    cases/
    fixtures/
```

## `spec.md`

`spec.md` defines why the skill exists, when it applies, what observable behavior it requires, and what damage it must avoid.

Write and validate the spec before creating the other files. When intent changes, review the spec diff first. See [Specifications](/concepts/specifications/).

## `SKILL.md`

`SKILL.md` contains the instructions the agent follows. It turns the requirements in `spec.md` into concrete steps and decisions.

Its frontmatter records a hash of `spec.md`. `skillet status` uses that hash to detect when the instructions are stale.

See [Write Agent Instructions](/guides/write-agent-instructions/).

## Optional Eval Cases

When repeatable measurement is useful, each file under `evals/cases/` links to a selected behavior or constraint by its stable slug. Cases run through a configured agent harness in fresh workspaces. A skill does not need a case for every behavior—or any cases at all—to be complete.

Checks inspect the workspace after the agent finishes:

- `file_exists` verifies an exact path.
- `shell` runs direct deterministic assertions.
- `judge` grades semantic requirements through the same agent harness.

See [Write Honest Evals](/guides/write-honest-evals/).

## Filesystem State Drives the Workflow

`skillet status` does not use sessions, queues, or hidden state. It inspects the files on disk and reports one next step.

```bash
skillet status path/to/my-skill
```

This makes agent and human edits interchangeable. A new session can continue from the repository without reconstructing previous conversation state.

## Core and Optional Flows

```text
specify → render → validate
                    └─ optional: evaluate → diagnose → improve
```

If you choose evals, classify failures before editing:

1. **Wrong intent:** update `spec.md`, then re-render derived artifacts.
2. **Weak instructions:** improve `SKILL.md` without changing a fair eval.
3. **Unfair case:** fix the case and state why the previous assertion was wrong.
