---
name: skillet-authoring
description: Authors, improves, or migrates agent skills with the Skillet CLI; use when asked to create or write a skill, improve its instructions or evals, diagnose failing evals, or migrate a legacy SKILL.md, uppercase SPEC.md, or spec.yaml skill, but not when merely using an existing skill.
spec_hash: 4b82b75c6e85
---

# Skillet Authoring

Use the Skillet CLI (`skillet`, or `npx @sentry/skillet`) to build skills spec-first. Treat `spec.md` as the behavior contract, `SKILL.md` as the agent instructions, and eval cases as repeatable runs of the spec scenarios. Never write these files from a remembered format.

## Steps

1. Run `skillet status <dir> --json` and do what `next` says. For a brand-new skill, `skillet new <name>` first. Never guess a skill's state or start over when artifacts already exist.
   - When status reports uppercase `SPEC.md`, preserve or rename that legacy document before creating lowercase `spec.md`; never parse it as the active Skillet spec.
   - When status marks lowercase `spec.md` invalid, preserve or rename legacy content and derive a valid Skillet spec before rendering `SKILL.md` or adding coverage.
2. When migrating, inventory behavior-bearing material before drafting: triggers, ordered workflow, exact lists, protocols and output formats, thresholds, failure and stop rules, constraints, runtime references, and maintenance docs that describe active behavior. Every accepted behavioral rule must land in `spec.md`; verbose execution detail may additionally remain in a linked runtime reference after the spec defines the observable contract. Explicitly supersede or reject non-behavior content.
3. Write `spec.md` before anything derived. If the user's intent, triggers, or edge cases are ambiguous, ask 2–4 pointed questions instead of inventing answers.
4. For every artifact you write (`spec`, `skill`, `evals`), fetch the format first — `skillet instructions <artifact> <dir> --json` — and follow its template and rules exactly.
5. Render for execution without weakening exact formats, enumerations, thresholds, delegation rules, or stop conditions. Move long protocols to `references/` when useful, link them from `SKILL.md`, then compare the old and new runtime surfaces and account for every removed rule. Search README and provenance docs for stale artifact paths, prompt locations, runtime-section claims, frontmatter descriptions, and coverage claims.
6. Run `skillet validate <dir>` after each artifact and fix every error before moving on. Cover every behavior with at least one eval case; validate warns about uncovered behaviors — clear those warnings before calling the skill complete.
7. Run `skillet eval <dir> --dry` to find checks that pass before the agent runs. Then run `skillet eval <dir> --trials 3 --baseline` to compare the tested results with and without the skill. Add `--report <file>` when the user wants a shareable run artifact (`npx vitest-evals serve <file>` renders it).

## When evals fail

Classify the failure before editing anything, then fix at that layer only:

- **Wrong intent** — the spec asks for the wrong thing: fix `spec.md`, then re-render SKILL.md.
- **Weak wording** — SKILL.md expresses the behavior ambiguously: tighten SKILL.md, leave the eval case untouched.
- **Unfair eval** — the case punishes a legitimately better outcome: fix the case and say explicitly why it was unfair.

Never delete or loosen an eval case just to get to green.

## Never

- Never report a skill as done while `skillet validate` reports errors.
- Never scaffold or modify skill artifacts when the user only asked a question or an unrelated task.
