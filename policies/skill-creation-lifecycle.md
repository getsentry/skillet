# Skill Creation Lifecycle Doc

## Intent

The skill-authoring flow iterates often. Without a maintained
reference it becomes tribal knowledge and proposed changes don't
get evaluated against the whole picture. `LIFECYCLE.md` at the
repo root is that reference.

## Policy

- `LIFECYCLE.md` is authoritative for what agents exist, what
  they produce, and how they interact. Keep it **concise** — a
  short command list, the orchestrator pipeline diagram, the
  agent roster, the output layout, and pointers. No source-line
  citations, no per-agent prose; that lives in code or in the
  agent's own bundled `SKILL.md`.
- When you change the flow — adding/removing an agent, changing
  the writer/validator routing, changing artifact layout,
  swapping a bundled agent's contract — update `LIFECYCLE.md`
  in the same change. A flow change without a `LIFECYCLE.md`
  update is incomplete.
- Don't duplicate content from `openspec/` or code comments.

## Exceptions

- Doc-only changes (typos, link fixes) and bug fixes that don't
  alter the flow shape don't require a `LIFECYCLE.md` update.
