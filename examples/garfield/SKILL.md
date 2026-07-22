---
name: garfield
description: Coordinates subagent review, fixes, and verification during implementation; use when the user explicitly asks for Garfield on an active code slice, but not for standalone review, brainstorming, non-code work, or PR CI iteration.
spec_hash: f50812cb5e67
disable-model-invocation: true
---

# Garfield

Use Garfield only when the user explicitly requests it during implementation. Review the current slice, preserve the user's intent, fix material current-diff problems, and stop when the slice is ready.

## 1. Capture the Intent

Before delegating review, record:

- requested behavior and intended changes
- compatibility expectations and non-goals
- diff/base and touched files
- repository instructions and relevant specs
- tests, generated artifacts, dependencies, and validation already run

Use this snapshot to judge every finding. Do not let a reviewer redefine the task.

## 2. Build the Effective Policy Set

Discover applicable repository policies under `policies/**/*.md`, excluding policy indexes and templates. Compare them with Garfield's bundled policies by intent and scope:

- repository-wide policy for the same concern: use it and omit the bundled policy
- narrower or adjacent policy: keep both
- unrelated policy: ignore it

Bundled policies:

- Read `references/code-comments.md` when comments or docstrings changed.
- Read `references/implementation-minimalism.md` when the slice adds guards, fallbacks, adapters, configuration, or defensive tests.
- Read `references/interface-design.md` when public/module boundaries, lifecycle, ownership, or naming changed.
- Read `references/test-quality.md` when tests, fixtures, or test obligations changed.

## 3. Select Review Tasks

Always review:

- behavior and spec alignment
- repository instructions
- validation coverage

Consider specs/docs, dead code, delayering, type boundaries, generated/dependency artifacts, comments, minimalism, interface design, test quality, and effective repository policies. Mark every candidate `applicable` or `skipped` from concrete diff evidence.

## 4. Delegate Reviews

Use one no-edit subagent per applicable task or policy. Give each reviewer only the slice context and policy it needs. Keep at most three Garfield subagents open at once:

1. Start up to three reviewers.
2. Collect and close completed reviewers.
3. Start the next reviewers.
4. Drain review agents before independent verification.

If subagents or required capacity are unavailable, stop and report that Garfield cannot run.

Require findings in this form:

```text
[severity][evidence:<label[,label]> <locator>] path:line - concern. impact: <impact>. fix: <smallest change>.
```

## 5. Triage and Fix

Accept a finding only when the current diff introduced or worsened it, made evidence stale, or omitted a required artifact.

- Fix blocker and high findings when the smallest fix preserves intent.
- Fix medium findings only when they are current-diff-caused and local.
- Reject vague, preference-only, or evidence-free findings.
- Defer unrelated hardening, broad cleanup, and out-of-intent behavior changes.
- Preserve unrelated user changes.

After material edits, run targeted validation and repeat only the reviews affected by the change. Use a separate verification advisor when validation is uncertain, the slice is risky, generated/dependency artifacts changed, or this is the final readiness pass.

Stop after repeated findings, three cycles without progress, unavailable subagents, or when the smallest fix requires broad or unclear behavior changes.

## Handoff

Report only:

- `garfield: pass` or `garfield: blocked`
- validation commands and results
- independent verification result when used
- residual blocker/high/medium concerns
- deferred adjacent improvements or unclear behavior changes

Do not include a cycle diary or generic review advice.

## Never

- Never run Garfield for standalone review or non-code iteration.
- Never substitute an agentless review for required subagents.
- Never change APIs, permissions, defaults, validation policy, serialization, or unrelated code outside the captured intent.
- Never revert unrelated user work.
