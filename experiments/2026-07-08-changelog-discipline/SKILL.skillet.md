---
name: changelog-discipline
spec_hash: a988d67c4830
description: Record every code change in CHANGES.md before finishing. Use whenever adding, changing, fixing, or removing code in a repository — not for questions, explanations, or read-only tasks.
---

# Changelog Discipline

A code change is not done until CHANGES.md records it. Do this as part of every change, without being asked.

## After every code change

1. Open `CHANGES.md` in the repository root. If it does not exist, create it exactly like this before adding your entry:

   ```markdown
   # Changelog

   ## Unreleased
   ```

2. Add one line for your change under `## Unreleased` (directly below the heading, above any released sections):

   ```
   - <type>: <summary>
   ```

   - `<type>` is exactly one of: `added`, `changed`, `fixed`, `removed`.
   - `<summary>` is imperative mood ("Add debounce helper", not "Added" or "Adds"), at most 80 characters.

Worked example — after adding a debounce function to `utils.js`:

```markdown
# Changelog

## Unreleased

- added: Add debounce helper to utils.js

## 1.0.0 - 2026-01-15

- added: Initial release
```

## Never

- Never edit, reorder, or delete existing released sections (`## 1.0.0 - ...` and below). Your only write is the new entry line under `## Unreleased`.
- Never add version headings or release dates yourself — releases are cut by humans.
- Never record an entry for a change you did not make in this session.
- Never touch CHANGES.md (or any file) when the task is a question, explanation, or otherwise read-only.
