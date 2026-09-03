---
name: skillet-authoring
description: Authors, improves, or migrates agent skills with the Skillet CLI; use when asked to create or write a skill, improve its instructions or evals, diagnose failing evals, or migrate a legacy SKILL.md, uppercase SPEC.md, or spec.yaml skill, but not when merely using an existing skill.
spec_hash: f66844f5ca6d
---

# Skillet Authoring

Run every Skillet command through the current package: `npx -y @sentry/skillet@latest`, or `pnpx @sentry/skillet@latest` in a pnpm environment. Never prefer a bare `skillet` executable from PATH; if one reports an update, rerun that command through the explicit latest package before continuing. Treat `spec.md` as the behavior contract and `SKILL.md` as the agent instructions. Evals are an optional extension, not part of ordinary authoring. Never write these files from a remembered format.

## Steps

1. Run `npx -y @sentry/skillet@latest status <dir> --json` and do what `next` says. For a brand-new skill, run `npx -y @sentry/skillet@latest new <name>` first. Never guess a skill's state or start over when artifacts already exist.
   - If status says the installed skillet-authoring instructions are stale, stop artifact work, follow its refresh direction, read the refreshed SKILL.md, and rerun status before continuing.
   - When status reports uppercase `SPEC.md`, preserve or rename that legacy document before creating lowercase `spec.md`; never parse it as the active Skillet spec.
   - When status marks lowercase `spec.md` invalid, preserve or rename legacy content and derive a valid Skillet spec before rendering `SKILL.md`.
2. When migrating, inventory behavior-bearing material before drafting: triggers, ordered workflow, exact lists, protocols and output formats, thresholds, failure and stop rules, constraints, runtime references, and maintenance docs that describe active behavior. Every accepted behavioral rule must land in `spec.md`; verbose execution detail may additionally remain in a linked runtime reference after the spec defines the observable contract. Explicitly supersede or reject non-behavior content.
3. When `spec.md` is next, fetch `npx -y @sentry/skillet@latest instructions spec <dir> --json`. If intent remains ambiguous after inspecting the available evidence, ask 2–4 pointed questions before writing. Then write the spec with the served Skillet version footer as its final non-empty line, run `npx -y @sentry/skillet@latest validate <dir>`, and fix every spec error before deriving anything.
4. When `SKILL.md` is next, fetch `npx -y @sentry/skillet@latest instructions skill <dir> --json` and render it from the validated spec. When migrating, do not weaken exact formats, enumerations, thresholds, delegation rules, or stop conditions. Move long protocols to `references/` when useful, link them from `SKILL.md`, then compare the old and new runtime surfaces and account for every removed rule. Search README and provenance docs for stale artifact paths, prompt locations, runtime-section claims, frontmatter descriptions, and coverage claims.
5. Run `npx -y @sentry/skillet@latest validate <dir>` and fix every error. A valid spec and current SKILL.md complete ordinary creation, improvement, or migration. Do not create eval cases or start an eval harness unless the user explicitly requested that work. An existing empty `evals/` directory is not a request.

## Optional eval work

Enter this branch only when the user explicitly asks to create, run, improve, or diagnose evals.

- To create or update cases, fetch `npx -y @sentry/skillet@latest instructions evals <dir> --json`, write cases for the selected high-value scenarios, and validate their schemas and spec links. Behaviors without cases remain valid; do not add cases merely to claim complete coverage.
- To execute cases, run only the dry, normal, baseline, trial, or report workflow the user requested. `npx -y @sentry/skillet@latest eval <dir> --dry` checks pristine workspaces; `eval <dir>` runs with the skill; `eval <dir> --baseline` also measures the results without it. Use `--trials <n>` only when repeated observations are useful, and `--report <file>` only when the user wants a shareable result (`npx vitest-evals serve <file>` renders it).

## When evals fail

Classify the failure before editing anything, then fix at that layer only:

- **Wrong intent** — the spec asks for the wrong thing: fix `spec.md`, then re-render SKILL.md.
- **Weak wording** — SKILL.md expresses the behavior ambiguously: tighten SKILL.md, leave the eval case untouched.
- **Unfair eval** — the case punishes a legitimately better outcome: fix the case and say explicitly why it was unfair.

Never delete or loosen an eval case just to get to green.

## Never

- Never report a skill as done while `npx -y @sentry/skillet@latest validate` reports errors.
- Never scaffold or modify skill artifacts when the user only asked a question or an unrelated task.
