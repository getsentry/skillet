---
title: Write Agent Instructions
description: Turn a specification into clear instructions for an agent.
type: tutorial
summary: Write concrete steps, decisions, constraints, and examples from the spec.
---

`SKILL.md` is not a copy of `spec.md`. The spec uses normative language for validation; the skill uses direct instructions for execution.

Fetch the current format and writing rules before writing:

```bash
skillet instructions skill --json
```

## Write the Frontmatter

```yaml
---
name: commit-conventions
description: Creates safe conventional commits. Use when the user asks to commit changes or write a commit message.
spec_hash: <hash from skillet status --json>
---
```

The description controls whether an agent loads the skill. Include concrete positive triggers and avoid claiming nearby tasks that belong outside the skill.

The `spec_hash` connects the rendered instructions to the current specification.

## Lead With Execution

Start with the workflow or decision points the agent needs during the task:

```markdown
## Workflow

1. Inspect the staged changes and current branch.
2. Create a descriptive branch when the repository is on `main`.
3. Choose the commit type from the actual change.
4. Commit only related changes.
```

Do not open with background the agent cannot act on.

## Express Every Behavior

Every behavior in `spec.md` must appear in the instructions. Preserve constraints as explicit never-do rules.

If two behaviors cannot be expressed without contradiction, stop and fix the specification instead of hiding the conflict in prose.

## Match Examples to the Work

Use examples when they reduce ambiguity:

- Coding skills should show realistic code, diffs, or commands.
- Writing skills should show representative before-and-after text.
- CLI workflows should show exact invocations and important output.
- Review skills should show valid findings and intentional non-findings.

Prefer one representative example over a catalog of superficial variants.

## Keep the Main Skill Small

Keep `SKILL.md` under roughly 150 lines. Move material needed only for particular task branches into `references/`:

```text
references/
  testing.md
  migrations.md
  api-reference.md
```

Link each reference with a sentence that says when to read it. Do not make the agent load every reference for every task.

## Validate and Evaluate

`skillet validate` can check:

- required frontmatter
- whether `spec_hash` matches the current spec
- eval case schemas and behavior coverage

It cannot mechanically decide whether the prose in `SKILL.md` expresses every behavior correctly. A behavior-name list or comment marker could be present without meaningful instructions, and semantic checking would require an agent or judge. Use eval cases to test the behavior that the prose is meant to produce.

```bash
skillet validate
skillet eval --trials 3 --baseline
```

Frontmatter validation catches structural errors. Evals show how the agent behaved in the tested cases; baselines compare those results with and without the skill.
