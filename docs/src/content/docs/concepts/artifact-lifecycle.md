---
title: Artifact Lifecycle
description: Understand how a Skillet skill moves from intent to measured behavior.
type: conceptual
summary: The specification defines behavior; the skill instructions and eval cases are written from it.
---

A Skillet skill is a directory of reviewable files. No Skillet command asks a model to generate those files internally.

```text
my-skill/
  spec.md
  SKILL.md
  references/
  evals/
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

## Eval Cases

Each file under `evals/cases/` links to a behavior or constraint by its stable slug. Cases run through a configured agent harness in fresh workspaces.

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

## Improve a Skill

```text
specify → render → evaluate → diagnose → improve
```

Classify failures before editing:

1. **Wrong intent:** update `spec.md`, then re-render derived artifacts.
2. **Weak instructions:** improve `SKILL.md` without changing a fair eval.
3. **Unfair case:** fix the case and state why the previous assertion was wrong.
