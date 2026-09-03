---
title: Create Your First Skill
description: Build a small commit-conventions skill from specification to validated instructions.
type: tutorial
summary: Build a complete skill while your agent writes the artifacts and Skillet validates them.
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

Ask your agent:

> Continue this skill from `spec.md`. Write `SKILL.md`, then validate the completed skill.

To write the file yourself, fetch the current format and rules:

```bash
skillet instructions skill --json
```

Run `skillet status --json` and copy `.spec.hash` into the frontmatter:

```markdown
---
name: commit-conventions
description: Creates safe conventional commits. Use when the user asks to commit changes or write a commit message.
spec_hash: <copy .spec.hash from skillet status --json>
---

# Commit Conventions

When the user asks to commit changes:

1. Inspect the current branch and staged diff.
2. Create a descriptive branch before committing when the repository is on `main`.
3. Choose the commit type from the staged change.
4. Commit only related staged changes.

## Commit Subjects

Write `<type>[(scope)]: <description>` with an imperative description. Keep the subject at or under 70 characters and omit the trailing period.

## Never

- Never amend, rebase, or force-push unless the user explicitly asks.
- Never include unrelated changes in the commit.
```

Run `skillet status` and `skillet validate` after writing. The recorded `spec_hash` tells Skillet whether `SKILL.md` is current with the spec. At this point the skill is complete.

## Optional: Add an Eval Case

Do this only when repeatable measurement is useful. You can select one high-value scenario without creating cases for every behavior.

```bash
mkdir -p evals/cases
```

Create `evals/cases/conventional-subject.yaml`:

```yaml
behavior: conventional-subject
prompt: |
  Commit the staged null-check fix.
setup: |
  git init -q -b feature/null-check
  git config user.email eval@example.com
  git config user.name "Skillet Eval"
  printf 'export const value = input ?? "fallback";\n' > value.ts
  git add value.ts
checks:
  - shell: >-
      git log -1 --format=%s | grep -Eq '^fix(\(.+\))?: .+[^.]$'
  - shell: >-
      test "$(git log -1 --format=%s | awk '{ print length }')" -le 70
  - judge: The commit subject uses imperative language and accurately describes the staged null-check fix.
```

The shell checks verify the format and length. The judge checks the parts that require meaning: imperative language and an accurate description of the change. The branch-safety behavior remains valid without its own case.

## Run the Optional Eval

```bash
skillet validate
skillet eval --dry
skillet eval --baseline
```

Do not weaken a fair case just to get a passing result. Fix the layer that is wrong:

- Change `spec.md` when the intended behavior is wrong.
- Change `SKILL.md` when the instructions are weak.
- Change the eval when it rejects a valid outcome or accepts a broken one.
