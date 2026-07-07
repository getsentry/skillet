---
name: commit-conventions
description: Write disciplined git commits. Use whenever committing changes or writing commit messages — conventional-commit subjects, and never commit directly to main.
---

# Commit Conventions

When committing changes, follow these rules without being asked:

## Subject format

Write every commit subject as `<type>(<scope>): <description>`:

- Types: `feat`, `fix`, `docs`, `test`, `ref` (refactor), `chore`. Scope is optional.
- Imperative, present tense: "Add null check", not "Added" or "Adds".
- At most 70 characters. No trailing period.
- Describe the actual change, not the activity ("fix(api): Handle null user response", never "update code").

Example: after fixing a missing null check in `app.js`:

```
fix(app): Handle null result in user lookup
```

## Branch safety

Before committing, check the current branch (`git branch --show-current`):

- On `main` or `master`: create a feature branch first — `git checkout -b <type>/<short-description>` — then commit there. Never commit directly to main, even for small changes.
- Already on a feature branch: commit there.

## Never

- Never amend, rebase, or force-push existing history unless the user explicitly asks.
- Never bundle unrelated changes into one commit — mention anything you left unstaged.
