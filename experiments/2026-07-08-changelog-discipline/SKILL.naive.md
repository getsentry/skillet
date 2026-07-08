---
name: changelog-discipline
description: Enforce changelog discipline by recording every code change in CHANGES.md. Use whenever making, editing, or deleting code in a repository — after any code change, add an entry under the "## Unreleased" section of CHANGES.md in the repo root. Do NOT use for questions, explanations, code review, or other read-only tasks that change no files.
---

# Changelog Discipline

Every code change must be recorded in `CHANGES.md` at the repository root. Treat the changelog update as part of the change itself — a code change without a changelog entry is incomplete.

## When this applies

- **Applies:** any task where you create, modify, or delete code (including config, build scripts, and other functional files).
- **Does NOT apply:** questions, explanations, code walkthroughs, debugging discussions, or any read-only task. In those cases, make **no changelog entry and no file modifications at all**.

## Workflow

1. Make the requested code change.
2. Open `CHANGES.md` in the repository root.
   - If it does not exist, create it with exactly this structure:

     ```markdown
     # Changelog

     ## Unreleased
     ```

3. Add one entry line for the change under the `## Unreleased` heading. The `## Unreleased` section must sit at the top of the file, directly after the `# Changelog` title. If the section is missing from an existing file, insert it directly after the `# Changelog` title — do not move or touch anything else.
4. Never edit, reorder, or delete existing released version sections (e.g. `## 1.0.0 - 2026-01-15`). Only the `## Unreleased` section may be modified.

## Entry format

Each entry is a single line, formatted exactly as:

```
- <type>: <summary>
```

Rules:

- `<type>` must be one of: `added`, `changed`, `fixed`, `removed` (lowercase).
  - `added` — new features or capabilities
  - `changed` — changes to existing behavior
  - `fixed` — bug fixes
  - `removed` — removed features or code
- `<summary>` must be in imperative mood ("add retry logic", not "added retry logic" or "adds retry logic") and at most 80 characters.
- One line per logical change. A task that makes several distinct changes gets several entries.

## Examples

```markdown
# Changelog

## Unreleased

- added: add exponential backoff to HTTP client retries
- fixed: handle empty response bodies in the webhook parser
- changed: rename config key `timeout` to `request_timeout`
- removed: drop deprecated v1 API endpoints

## 1.0.0 - 2026-01-15

- added: initial release
```

New entries may be added anywhere within the Unreleased list, but they must stay inside that section — above the first released version heading.
