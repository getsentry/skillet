# Skill Lifecycle Doc

## Intent

The core skill lifecycle (spec -> SKILL.md), with an explicit optional
evals -> lift branch, is the product.
Without a maintained reference it becomes tribal knowledge and proposed
changes don't get evaluated against the whole picture. `LIFECYCLE.md`
at the repo root is that reference.

## Policy

- `LIFECYCLE.md` is authoritative for the artifact flow: what files
  exist per skill, which are optional, who writes them (human/agent vs
  CLI), the eval execution steps, and where each concern lives in src/. Keep it
  concise -- diagrams and tables, no per-module prose.
- When you change the flow -- artifact layout, eval execution order,
  engine mechanics, harness install mechanisms -- update `LIFECYCLE.md`
  in the same change.
- Reviews of flow-changing PRs should check `LIFECYCLE.md` was updated.
