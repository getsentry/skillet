---
title: Specifications
description: Define testable skill intent with Skillet's Markdown grammar.
type: conceptual
summary: Behaviors and scenarios connect human-reviewed intent to eval coverage.
---

`spec.md` is the source of truth for a skill. It uses a small Markdown grammar so humans can review it and Skillet can parse it with line-accurate errors.

## Required Sections

```markdown
# <Skill Name>

## Intent

## Triggers

## Behaviors
```

`## Constraints` is optional.

## Intent

Use one or two paragraphs to explain what the skill changes and why it exists. Keep implementation detail out of this section.

## Triggers

State when the skill should and should not load:

```markdown
- **SHOULD** apply when the user asks to commit changes
- **SHOULD NOT** apply when the user only asks to review changes
```

The `SHOULD NOT` rule keeps the skill out of related tasks it does not cover.

## Behaviors

Each behavior is one observable, independently testable rule:

```markdown
### Behavior: Branch safety

The agent SHALL NOT commit directly to `main`.

#### Scenario: Commit requested on main

- **WHEN** the user asks to commit while the repository is on `main`
- **THEN** the agent creates a descriptive branch before committing
```

Skillet converts behavior names into stable IDs such as `branch-safety`. Eval cases use these IDs to link back to the spec.

Every behavior needs at least one scenario. If a statement cannot produce a concrete WHEN/THEN example, it is probably context rather than a behavior.

## Constraints

Constraints name damage the skill must never cause:

```markdown
### Constraint: Preserve history

The agent MUST NOT amend, rebase, or force-push unless the user explicitly asks.
```

Constraints can have eval cases, but only behaviors require coverage today.

## Keep the Contract Small

More than about eight behaviors often indicates two different skills. Split by task boundary instead of creating one skill that tries to govern an entire discipline.

Fetch the current grammar and template before writing:

```bash
skillet instructions spec
```
