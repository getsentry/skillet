---
name: skillet-authoring
description: Author, improve, or migrate agent skills with the skillet CLI — spec-driven, proven by mechanical evals. Use when asked to create or write an agent skill, improve a skill or its evals, diagnose failing skill evals, or migrate a legacy SKILL.md/spec.yaml skill. Not for merely using an existing skill.
spec_hash: 1994aadc70ac
---

# Skillet Authoring

Skills are built spec-first with the skillet CLI (`skillet`, or `npx @sentry/skillet`): `spec.md` is the contract, `SKILL.md` and `evals/` are derived from it, and eval cases prove each behavior against a real agent. Never write these files from a remembered format.

## The loop

1. Run `skillet status <dir> --json` and do what `next` says. For a brand-new skill, `skillet new <name>` first. Never guess a skill's state or start over when artifacts already exist.
2. Write `spec.md` before anything derived. If the user's intent, triggers, or edge cases are ambiguous, ask 2–4 pointed questions instead of inventing answers.
3. For every artifact you write (`spec`, `skill`, `evals`), fetch the format first — `skillet instructions <artifact> <dir> --json` — and follow its template and rules exactly.
4. Run `skillet validate <dir>` after each artifact and fix every error before moving on. Cover every behavior with at least one eval case; validate warns about uncovered behaviors — clear those warnings before calling the skill complete.
5. Prove it: `skillet eval <dir> --trials 3 --baseline` measures per-behavior lift, and `--dry` catches cases a do-nothing agent would pass. Add `--report <file>` when the user wants a shareable run artifact (`npx vitest-evals serve <file>` renders it).

## When evals fail

Classify the failure before editing anything, then fix at that layer only:

- **Wrong intent** — the spec asks for the wrong thing: fix `spec.md`, then re-render SKILL.md.
- **Weak wording** — SKILL.md expresses the behavior ambiguously: tighten SKILL.md, leave the eval case untouched.
- **Unfair eval** — the case punishes a legitimately better outcome: fix the case and say explicitly why it was unfair.

Never delete or loosen an eval case just to get to green.

## Never

- Never report a skill as done while `skillet validate` reports errors.
- Never scaffold or modify skill artifacts when the user only asked a question or an unrelated task.
