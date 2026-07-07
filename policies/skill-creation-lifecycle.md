# Skill Lifecycle Doc

## Intent

The skill lifecycle (spec -> SKILL.md -> evals -> lift) is the product.
Without a maintained reference it becomes tribal knowledge and proposed
changes don't get evaluated against the whole picture. `LIFECYCLE.md`
at the repo root is that reference.

## Policy

- `LIFECYCLE.md` is authoritative for the artifact flow: what files
  exist per skill, who writes them (human/agent vs CLI), the eval
  execution steps, and where each concern lives in src/. Keep it
  concise -- diagrams and tables, no per-module prose.
- When you change the flow -- artifact layout, workflow set, eval
  execution order, harness install mechanisms -- update `LIFECYCLE.md`
  in the same change.
- Reviews of flow-changing PRs should check `LIFECYCLE.md` was updated.
