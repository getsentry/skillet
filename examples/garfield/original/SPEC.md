# Garfield Specification

## Intent

`garfield` is a reusable implementation hardening loop. It runs while actively implementing, after each meaningful code slice, snapshots the core user or PR intent, selects applicable review tasks from diff evidence, delegates each applicable task to a no-edit subagent in bounded rolling batches, coordinates validity of the subagents' findings, fixes accepted material concerns only when the smallest fix preserves that core intent, validates the result, asks a separate verification advisor only when it adds signal, and repeats until current-diff-caused blocker/high/medium concerns are gone.

## Scope

In scope:
- incremental feature or fix implementation slices
- current-diff review and directly related files
- behavior-preserving cleanup, delayering, type tightening, docs, tests, and dead-code removal that support the current slice
- fix candidates introduced, worsened, made stale, or omitted by the current diff
- mandatory subagent-backed advisory review for every applicable review task
- applicable effective-policy review after source-app policies supersede bundled policies that govern substantially the same concern
- independent verification advice for risky slices, ambiguous validation, or final readiness checks
- fixing material concerns found by the review
- targeted tests, type checks, linters, builds, and explicit validation blockers
- specs/docs, effective policy compliance, dead code, delayering, type contracts, generated artifacts, dependency drift, implementation minimalism, and test quality

Out of scope:
- review-only branch audits with no implementation authority
- full PR CI iteration or external reviewer response loops
- broad rewrites unrelated to the current slice
- behavior changes outside the core user or PR intent
- adjacent hardening, compatibility changes, API policy changes, permission semantics changes, validation normalization, parameter precedence changes, serialization changes, or default changes not explicitly requested and not required to fix a regression introduced by the slice
- aesthetic-only style feedback unless required by a bundled or source-app policy
- product requirement changes without user approval
- non-code brainstorming or generic iteration

## Users And Trigger Context

- Primary users: agents implementing code who need a tight subagent-backed hardening loop before handoff.
- Invocation: user-invoked only; the model must not activate Garfield automatically.
- Common user requests: "run garfield on this feature slice", "use garfield after each code slice", "review/fix/repeat this implementation", "use a subagent to find concerns before you finish".
- Should not trigger for: standalone code review requests, PR CI failure loops, harsh maintainability audits, general brainstorming, documentation-only explanation, non-code iteration, or requests to create/update skills.

## Runtime Contract

- Required first actions: inspect status, diff/base, repo instructions, relevant specs/docs, relevant tests, generated artifacts, lockfiles, bundled policy references, discovered source-app policies, their intent-and-scope relationships, and the core intent including intended behavior changes, compatibility expectations, touched areas, and known non-goals.
- Required outputs: no cycle log; final status with validation run, independent verification result when used, and residual material concerns only.
- Non-negotiable constraints: compare bundled and discovered source-app policies by intent and scope; omit a bundled policy when a source-app policy establishes repo-wide defaults for substantially the same concern, regardless of names or wording; retain narrower or adjacent policies as supplements; enumerate candidate review tasks across behavior/spec, specs/docs, repo instructions, dead code, delayering, type boundaries, generated/dependencies, validation, and the resulting effective policy set; always run behavior/spec, repo-instructions, and validation review; classify every other task or effective policy as applicable or skipped from concrete diff evidence and scope; use one review-only subagent per applicable task or effective policy; never send an omitted bundled policy to a reviewer or use it for findings; keep at most 3 Garfield subagents open through a rolling spawn/wait/close/refill loop; do not rely on implicit runtime queuing; drain review agents before conditional verification; stop if subagents or required capacity are unavailable; coordinate validity instead of accepting findings automatically; use a separate verification advisor only when it adds signal; require evidence labels, cause, and concrete locators for policy concerns; apply only high-confidence accepted material concerns whose smallest fix preserves core intent and does not expand the patch; defer valid concerns that require out-of-intent behavior changes, pre-existing policy cleanup, or speculative hardening; preserve unrelated user changes; repeat after material edits; avoid unbounded loops; and do not stop with unresolved current-diff-caused blocker/high/medium concerns unless blocked or explicitly deferred.
- Expected bundled files loaded at runtime: `SKILL.md` and `references/code-comments.md`, `references/implementation-minimalism.md`, `references/interface-design.md`, and `references/test-quality.md` for effective-policy comparison and retained bundled-policy review.

## Source And Evidence Model

Authoritative sources:
- the user's seed prompt
- local repo instructions
- the effective policy set derived from bundled policy references and discovered source-app policies under `policies/**/*.md`
- the core user or PR intent and explicit non-goals
- changed code, related specs/docs, and tests
- generated artifacts, lockfiles, schemas, and dependency manifests
- validation command output
- independent verification advisor output when used

Useful improvement sources:
- positive examples: loops that caught real spec, policy, type, or dead-code issues before handoff
- negative examples: loops that accepted vague advice, over-refactored, or stopped before material concerns were resolved
- commit logs/changelogs: regressions caused by missing docs, weak types, or stale layers
- issue or PR feedback: recurring reviewer comments about the loop missing concerns
- validation results: commands that caught or failed to catch slice regressions
- source-app policy docs: recurring local engineering rules that should replace or supplement bundled Garfield policies according to intent and scope

Data that must not be stored:
- secrets
- customer data
- private URLs or identifiers not needed for reproduction

## Reference Architecture

- `SKILL.md` contains: runtime intent, workflow, advisor prompts, concern rubric, source-app policy discovery and supersession, review-task enumeration, loop rules, and output contract.
- `README.md` contains: bundled policy inventory and maintenance reference notes.
- `references/` contains: bundled policy references and the policy template.
- `references/evidence/` contains: future redacted examples if recurring loop failures justify persistent evidence.
- `scripts/` contains: nothing yet.
- `assets/` contains: nothing yet.

## Validation

- Lightweight validation: run the skill structural validator and manually inspect trigger wording, runtime compactness, anti-loop rules, severity semantics, evidence labels, independent verification, and portability.
- Deeper validation: run the skill against real implementation slices and check whether it finds actionable, line-grounded concerns without drifting into broad prose.
- Holdout examples: add only after enough real positive and negative loop outcomes exist.
- Acceptance gates: valid frontmatter, concise runtime body, runtime policy references routed from `SKILL.md`, agentic local-over-bundled policy supersession, clear loop stopping rule, severity semantics, evidence-labeled findings, mandatory no-edit review subagent contract, coordinator validity role, useful-but-not-mandatory independent verification contract, and no missing runtime references.

## Known Limitations

- Subagent availability, capacity, release, and isolation semantics vary by agent runtime; the three-agent rolling window is conservative but cannot guarantee capacity in a session already using subagents.
- Review quality depends on giving each advisor enough diff, spec, policy, and validation context.
- Intent-and-scope supersession is a semantic judgment; ambiguous policy relationships may still produce redundant or missing review coverage and should be tuned from real runs.
- Independent verification can confirm evidence coverage, not prove correctness beyond available commands and inspected artifacts.
- The skill can over-loop on subjective concerns unless the main agent rejects weak, pre-existing, or expanding advice explicitly.

## Maintenance Notes

- Update `SKILL.md` when loop behavior, advisor prompts, evidence labels, stopping rules, concern categories, source-app policy discovery or supersession, or output contract changes.
- Update `references/` when bundled policies change; keep policy references short using `references/policy-template.md`.
- Update `SOURCES.md` when adding provenance, decisions, gaps, or changelog entries.
- Update `references/evidence/` only with redacted examples that materially improve future loop behavior.
