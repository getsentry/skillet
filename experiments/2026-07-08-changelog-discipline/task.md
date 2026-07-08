Create an agent skill that enforces changelog discipline in any repository the agent works in:

- Whenever the agent makes a code change, it must also record that change in CHANGES.md in the repository root.
- Entries go under an "## Unreleased" heading at the top of the file (directly after the "# Changelog" title).
- If CHANGES.md does not exist yet, create it with a "# Changelog" title and an "## Unreleased" section.
- Each entry is a single line formatted exactly as "- <type>: <summary>" where <type> is one of added, changed, fixed, removed — and the summary is imperative mood and at most 80 characters.
- Existing released version sections (e.g. "## 1.0.0 - 2026-01-15") must never be edited or reordered.
- The skill applies when the agent changes code. It must NOT fire for questions, explanations, or read-only tasks — no changelog entry, no file modifications at all in those cases.
