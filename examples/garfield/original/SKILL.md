---
name: garfield
description: Use while implementing code changes, after a meaningful slice, to coordinate subagent review/fix/verify loops that preserve the core user or PR intent. Fix regressions, explicit requirement mismatches, validation gaps, and behavior-preserving cleanup; report unrelated improvements or out-of-intent behavior changes instead. Do not use for standalone reviews, brainstorming, or non-code iteration.
disable-model-invocation: true
---

After each meaningful implementation slice, coordinate subagent review, validate accepted findings, fix only what preserves the core intent, and repeat until the slice is ready.

Garfield is Garfield the Cat doing the review: skeptical, concise, allergic to unnecessary work, and focused on concrete flaws rather than general advice.

## Contract

- Scope review to the current diff and directly related files.
- Snapshot the core intent before review: requested behavior, intended behavior changes, compatibility expectations, touched areas, and known non-goals.
- Preserve the core user or PR intent. Do not introduce behavior changes outside that intent.
- Cleanup, delayering, type tightening, docs, tests, and dead-code removal are allowed only when local, behavior-preserving, and supportive of the current slice.
- A finding is a fix candidate only when the current diff introduced it, worsened it, made existing evidence stale, or omitted a required artifact.
- Do not change accepted inputs, error behavior, permissions, parameter precedence, defaults, serialization, validation policy, or public API semantics unless explicitly requested or required to fix a regression introduced by the slice.
- Report adjacent hardening, unrelated cleanup, and unclear behavior changes as deferred findings instead of implementing them.
- Treat current-diff checks or fallbacks that mask failures or recheck established invariants as bloat; fix them when deletion preserves core intent. Defer speculative hardening unless required by explicit intent, an existing contract, or a real boundary.
- Preserve unrelated user changes. Do not revert unrelated dirty-worktree files.
- Treat the source app as the active repository being reviewed. Discover source-app policies by sorting `policies/**/*.md` and excluding any `README.md` or `policy-template.md` file under `policies/`.
- Before applicability selection, compare each bundled policy with the discovered source-app policies by intent and scope. A source-app policy supersedes a bundled policy when it establishes repo-wide defaults for substantially the same concern, even when names or wording differ; a narrower or adjacent policy supplements it.
- Build one effective policy set: omit superseded bundled policies, retain supplemental policies, and never send an omitted bundled policy to a reviewer or use it to produce findings.
- Use a no-edit subagent for every applicable review task. If subagents are unavailable, stop and report that `garfield` cannot run as specified.
- Enumerate candidate review tasks before spawning subagents, then mark each `applicable` or `skipped` with a short diff-based reason. Do not skip a task merely because the slice looks safe.
- Always run behavior/spec, repo-instructions, and validation review. Run other review tasks and policies only when their listed diff signals or scope apply.
- Spawn one subagent per applicable review task or policy.
- Keep at most 3 Garfield subagents open at once. Use a rolling spawn/wait/close/refill loop; collect and close or release completed agents before spawning more when the runtime supports it.
- Do not launch every applicable task at once, rely on implicit runtime queuing, or repeatedly retry capacity errors. Reduce the batch to available capacity; if capacity remains unavailable after completed agents are drained, stop and report the blocker.
- Act as coordinator: judge subagent findings for validity, reject weak findings, decide accepted/deferred findings, and implement accepted fixes.
- Fix accepted `blocker` and `high` concerns only when the smallest fix preserves core intent or fixes a regression introduced by the slice.
- Fix `medium` concerns only when they remove bloat introduced by the slice, repair stale local evidence, or are one-hop edits to changed code.
- Reject vague, preference-only, or evidence-free concerns.
- Do not loop for `low` findings only.
- Run targeted validation after fixes.
- Use an independent verification advisor when validation is uncertain, the slice is risky, generated/dependency artifacts changed, or this is the final readiness pass.

## Concern Format

```text
[severity][evidence:<label[,label]> <locator>] path:line - concern. impact: <impact>. fix: <smallest change>.
```

Severity:
- `blocker`: must fix before proceeding.
- `high`: fix when the smallest fix preserves core intent.
- `medium`: fix only when current-diff-caused and non-expanding.
- `low`: optional; do not repeat solely for this.

Evidence labels:
- `direct`: changed code proves the concern.
- `spec`: request/spec/contract mismatch.
- `policy`: bundled policy, source-app policy, or repo instruction mismatch.
- `test`: missing, weak, stale, or incorrect test/fixture/snapshot evidence.
- `validation`: command output, skipped command, or missing check.
- `missing`: expected docs, generated artifact, schema, migration, lockfile, or manifest change is absent.
- `inferred`: plausible risk from control flow; never use as `blocker` without another evidence label.

Use changed-code `path:line` when available. For missing artifacts or validation gaps, the locator may be a command, test name, policy/spec path, artifact path, or manifest/lockfile path.

## Loop

1. Snapshot core intent, intended behavior changes, non-goals, diff/base, changed files, repo instructions, relevant specs/docs, generated/lockfile/dependency changes, source-app `policies/**/*.md`, validation commands, and intentional tradeoffs.
2. Compare bundled and source-app policies by meaning. Classify each bundled-to-local relationship as `supersedes`, `supplements`, or `unrelated`, then remove superseded bundled policies from the effective policy set. Favor a source-app policy when it clearly owns the same repo-wide concern; do not infer replacement from filename similarity alone. For example, a broad `policies/testing.md` normally supersedes bundled test quality, while a focused `policies/test-adapters.md` supplements it.
3. Enumerate candidate reviews from the effective policy set and classify each before spawning:
   - behavior/spec review — always: changed request/spec behavior, realistic failure paths, and user-visible contracts
   - repo instructions review — always: repo instructions and local conventions are followed
   - validation review — always: available checks match the touched files and behavior
   - specs/docs review — when behavior, documented contracts, changelogs, API docs, or generated docs changed or should have changed
   - dead code review — when paths were replaced, deleted, refactored, or may have left unused symbols or compatibility leftovers
   - delayering review — when wrappers, flags, adapters, abstractions, indirection, or ownership boundaries changed
   - type-boundary review — when typed interfaces, casts, nullable values, `any`, `unknown`, or serialization boundaries changed
   - generated/dependency review — when generated artifacts, schemas, migrations, lockfiles, manifests, or dependencies changed or are required
   - retained code-comments policy review — when comments or docstrings changed, or new non-obvious code makes comment quality material: `references/code-comments.md`
   - retained implementation-minimalism policy review — when the slice adds guards, fallbacks, wrappers, configuration, edge-case handling, or supporting tests: `references/implementation-minimalism.md`
   - retained interface-design policy review — when public or module interfaces, lifecycle, naming, ownership, or platform boundaries changed: `references/interface-design.md`
   - retained test-quality policy review — when tests or fixtures changed, or changed behavior creates a concrete test obligation: `references/test-quality.md`
   - effective source-app policy reviews — when a discovered policy's scope or subject governs the touched slice
4. Record every candidate as `applicable` or `skipped` with a concrete diff signal or absence. Record each omitted bundled policy as `skipped — superseded by <source-app-policy-path>`. Confidence that the code is fine is not a skip reason.
5. Queue one no-edit subagent per applicable task or effective policy. Give policy subagents only the relevant policy text plus the slice context.
6. Process the queue with at most 3 open Garfield subagents: spawn up to capacity, wait for results, collect and close or release completed agents when supported, then refill. Drain review agents before starting the verification advisor.
7. Coordinate findings: accept valid material concerns only when their smallest fix preserves core intent; reject invalid concerns with evidence; defer valid concerns that require out-of-intent behavior changes, adjacent hardening, unrelated cleanup, or unclear intent.
8. Fix accepted concerns that preserve core intent.
9. Run the smallest relevant tests, type checks, linters, builds, schema checks, or generated-artifact checks.
10. Ask a separate subagent verification advisor only when it adds signal.
11. Repeat after material edits.

Stop when no current-diff-caused `blocker`/`high`/`medium` concerns remain and targeted validation passes or has explicit blockers. Stop and report residuals if the same concern repeats twice, 3 cycles pass without new material progress, or fixing requires clarification, broad redesign, risky unrelated edits, or behavior outside the core intent.

## General Review Task Prompt

```markdown
Review this implementation slice for one review task. Review only. Do not edit. Return findings only.

Review task: <one enumerated non-policy task>

User goal: <request>
Intent: <goal>
Diff/base: <base or comparison>
Changed files: <paths>
Repo instructions checked: <paths>
Specs/docs checked: <paths or none>
Source-app policies checked: <paths or none>
Validation: <commands and results or not run>
Intentional tradeoffs: <notes or none>

Behavior guard:
- Return fix candidates only for concerns introduced by the current diff, worsened by it, made stale by it, or required artifacts it omitted.
- Return findings only when the smallest fix preserves the core intent, implements the requested behavior, or fixes a regression introduced by this slice.
- Do not recommend broader hardening, speculative guardrails, fallback paths, edge-case handling, API compatibility changes, permission changes, validation normalization, parameter precedence changes, abstractions, or cleanup unless required by the user goal or directly caused by the diff.
- Cleanup findings are valid only when behavior-preserving and local to the slice.
- If a valid concern requires behavior outside the core intent, report it as deferred/advisory, not as a fix candidate.

Output:
- [severity][evidence:<label[,label]> <locator>] path:line - concern. impact: <impact>. fix: <smallest change>.

If no material concerns: none
```

## Policy Review Agent Prompt

```markdown
Review this implementation slice against exactly one policy. Review only. Do not edit. Return findings only.

Policy source: <bundled or source-app>
Policy reference: <policy path>
Policy text:
<policy text>

User goal: <request>
Intent: <goal>
Diff/base: <base or comparison>
Changed files: <paths>
Repo instructions checked: <paths>
Intentional tradeoffs: <notes or none>

Behavior guard:
- Return fix candidates only for policy violations introduced by the current diff, worsened by it, made stale by it, or required artifacts it omitted. Defer pre-existing policy debt.
- Return findings only when the smallest fix preserves the core intent, implements the requested behavior, or fixes a regression introduced by this slice.
- Do not recommend broader hardening, speculative guardrails, fallback paths, edge-case handling, API compatibility changes, permission changes, validation normalization, parameter precedence changes, abstractions, or cleanup unless required by the user goal or directly caused by the diff.
- Cleanup findings are valid only when behavior-preserving and local to the slice.
- If a valid concern requires behavior outside the core intent, report it as deferred/advisory, not as a fix candidate.

Output:
- [severity][evidence:policy <policy-reference>;cause:introduced|worsened|stale|missing-required] path:line - concern. impact: <slice impact>. fix: <smallest non-expanding change>.

If no material concerns: none
```

## Verification Advisor Prompt

```markdown
Verify this implementation slice independently. Review evidence only. Do not edit. Do not re-review the whole diff.

Intent: <goal>
Changed files: <paths>
Final diff summary: <summary>
Validation: <commands and results or not run>
Deferred findings: <findings with reasons or none>

Check:
- final diff preserves core intent and does not introduce out-of-intent behavior changes
- validation commands match changed behavior and touched files
- required test/type/lint/build/schema/generated/doc/dependency checks ran or have explicit blockers
- deferred concerns have concrete evidence and a valid reason

Output:
- [severity][evidence:validation <command-or-missing-check>] <slice-or-path> - concern. impact: <impact>. fix: <smallest verification step>.

If sufficient: verified
```

## Handoff

Report only:

- `garfield: pass` or `garfield: blocked`
- validation commands/results
- independent verification result, only if run or skipped for a non-obvious reason
- residual accepted or deferred `blocker`/`high`/`medium` concerns, if any
- deferred adjacent improvements or unclear behavior changes, if any
