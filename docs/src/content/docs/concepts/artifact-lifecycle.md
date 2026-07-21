---
title: Artifact Lifecycle
description: Understand how a Skillet skill moves from intent to measured behavior.
type: conceptual
summary: The specification is the contract; instructions and evals are derived artifacts.
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

## The Contract

`spec.md` defines why the skill exists, when it applies, what observable behavior it requires, and what damage it must avoid.

Write and validate the spec before creating derived artifacts. When intent changes, review the spec diff first.

## The Instructions

`SKILL.md` is the text the agent loads. It translates the normative contract into an executable workflow.

Its frontmatter records a hash of `spec.md`. `skillet status` uses that hash to detect when the instructions are stale.

## The Evidence

Each file under `evals/cases/` links to a behavior or constraint by its stable slug. Cases run through a configured agent harness in fresh workspaces.

Checks inspect the workspace after the agent finishes:

- `file_exists` verifies an exact path.
- `shell` runs direct deterministic assertions.
- `judge` grades semantic requirements through the same agent harness.

## Filesystem State Drives the Workflow

`skillet status` does not use sessions, queues, or hidden state. It inspects the files on disk and reports one next step.

```bash
skillet status path/to/my-skill
```

This makes agent and human edits interchangeable. A new session can continue from the repository without reconstructing previous conversation state.

## Improvement Loop

```text
specify → render → evaluate → diagnose → improve
```

Classify failures before editing:

1. **Wrong intent:** update `spec.md`, then re-render derived artifacts.
2. **Weak instructions:** improve `SKILL.md` without changing a fair eval.
3. **Unfair case:** fix the case and state why the previous assertion was wrong.
