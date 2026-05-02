# Skill Creation Lifecycle Doc

## Intent

Skillet's value depends on contributors understanding the
end-to-end flow of how a skill gets generated. The lifecycle has
several stages (spec-author, skill-gen, eval-gen with its
generate/verify/consolidate/render/write sub-stages, the improve
loop) and the architecture iterates often. Without an explicit,
maintained reference, that flow becomes tribal knowledge — each
contributor has to reverse-engineer it from scratch and
proposed changes don't get evaluated against the whole picture.

`LIFECYCLE.md` at the repo root is that reference.

## Policy

- The skill creation lifecycle is documented in `LIFECYCLE.md`
  at the repo root. Treat it as authoritative for what stages
  exist, what they produce, and how they interact.
- When you change the flow — adding a phase, splitting a stage,
  changing artifact layout, swapping a prompt, removing a step —
  update `LIFECYCLE.md` in the same change. A flow change without
  a `LIFECYCLE.md` update is incomplete.
- Keep `LIFECYCLE.md` brief and well-structured: ASCII diagrams,
  short bullets, and pointers to source files. Do not duplicate
  spec or design content from `openspec/`.
- When `LIFECYCLE.md`'s "Open work" section calls out a known
  gap (e.g. cross-suite dedup limits), the next change that
  closes the gap should update or remove that section.

## Exceptions

- Documentation-only changes (typo fixes, link updates) don't
  require a `LIFECYCLE.md` review.
- Bug fixes that don't change the flow's shape (e.g. a deadlock
  fix in an existing stage) don't require updates.
