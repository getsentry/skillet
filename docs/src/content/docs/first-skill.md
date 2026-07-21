---
title: Create Your First Skill
description: Build a small commit-conventions skill from specification through evaluation.
type: tutorial
summary: Follow the complete artifact workflow without relying on hidden generation.
---

This tutorial builds a skill that writes conventional commit subjects and avoids committing directly to `main`.

## Create the Scaffold

```bash
skillet new commit-conventions
cd commit-conventions
```

The scaffold contains:

```text
commit-conventions/
  spec.md
  evals/
    cases/
    fixtures/
```

## Define the Behavior

Replace the placeholders in `spec.md` with a small contract:

```markdown
# Commit Conventions

## Intent

Produce focused commits with conventional subjects and safe branch behavior.

## Triggers

- **SHOULD** apply when the user asks to create a commit
- **SHOULD NOT** apply when the user only asks to review changes

## Behaviors

### Behavior: Conventional subject

The agent SHALL write an imperative conventional-commit subject no longer than 70 characters.

#### Scenario: Staged bug fix

- **WHEN** the staged changes fix a bug and the user asks to commit
- **THEN** the commit subject uses the `fix` type and describes the change

### Behavior: Branch safety

The agent SHALL NOT commit directly to `main`.

#### Scenario: Commit requested on main

- **WHEN** the current branch is `main` and the user asks to commit
- **THEN** the agent creates a descriptive branch before committing
```

Validate before deriving anything from the spec:

```bash
skillet validate
```

## Render the Agent Instructions

Ask your agent to continue the skill, or fetch the current writing contract yourself:

```bash
skillet instructions skill --json
```

Write `SKILL.md` in imperative language. Lead with the workflow the agent must follow, include the important constraints, and keep detailed reference material outside the main skill body.

Run `skillet status` after writing. The recorded `spec_hash` tells Skillet whether `SKILL.md` is current with the spec.

## Add an Eval Case

Create `evals/cases/conventional-subject.yaml`:

```yaml
behavior: conventional-subject
prompt: |
  Commit the staged null-check fix.
setup: |
  git init -q -b feature/null-check
  printf 'export const value = input ?? "fallback";\n' > value.ts
  git add value.ts
checks:
  - shell: git log -1 --format=%s | grep -Eq '^fix(\(.+\))?: .+'
```

The shell check directly verifies the required commit subject. It does not guess which internal commands or reasoning the agent used.

Add a separate case for `branch-safety` so every behavior has coverage.

## Evaluate the Skill

```bash
skillet validate
skillet eval --dry
skillet eval --trials 3 --baseline
```

Do not weaken a fair case just to get a passing result. Fix the layer that is wrong:

- Change `spec.md` when the intended behavior is wrong.
- Change `SKILL.md` when the instructions are weak.
- Change the eval when it rejects a valid outcome or accepts a broken one.
