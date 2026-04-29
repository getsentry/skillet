## Why

Real-skill testing of skillet 0.18-0.23 (warden, wrdn-pii, code-simplifier) surfaced three production bugs and two correctness gaps:

- `spec import` is destructive on partial failure — it clobbers SKILL.md before eval-gen runs, so a downstream failure leaves the user with a half-broken skill and no original to fall back on.
- Eval-gen doesn't scale past ~20 behaviors. Sending 40+ behaviors as one LLM call produces malformed JSON and times out at ~8-9 minutes.
- Imports lose `allowed-tools` and other frontmatter fields. New skills via `create` ship without an `allowed-tools` list at all, so anyone not running `--dangerously-skip-permissions` hits permission prompts immediately.
- Per-behavior eval-gen calls don't see the spec's must_not rules, so positive fixtures occasionally trip them (e.g. a privacy skill's "globex-corp" prompt was flagged by its own redaction rule).
- Debug logs are thin. When eval-gen fails after 8 minutes there's no signal showing which behavior errored, what the LLM returned, or how long each phase took.

## What Changes

- **MODIFIED** `spec import` and any other write path that mutates an existing skill becomes transactional: stage all writes to a temp directory and swap atomically on success. Failure restores the original SKILL.md / spec.yaml / eval files unchanged.
- **MODIFIED** Eval-gen replaces its single-batch LLM call with one call per behavior. Calls run in parallel with a concurrency cap. Failed behaviors are retried independently; partial success persists already-written files. Generation can use a cheaper model (`SKILLET_EVAL_GEN_MODEL`, defaulting to the judge model) since the task is small and constrained.
- **NEW** `frontmatter_extras` field on the spec preserves arbitrary frontmatter keys (e.g. `allowed-tools`, `argument-hint`) that don't fit skillet's schema. spec-import populates it from the source SKILL.md; skill-gen renders the keys back into the regenerated frontmatter on every regen.
- **MODIFIED** `create` defaults a fresh skill's `allowed-tools` to a sensible Claude Code subset (`Read Grep Glob Bash Edit Write`) rendered into the generated SKILL.md frontmatter. CLI flag `--tools "<list>"` overrides; `--no-default-tools` opts out.
- **MODIFIED** Per-behavior eval-gen prompts include the full spec's `must_not` rules with an explicit instruction not to construct fixtures that trip them.
- **NEW** `SKILLET_VERBOSE=1` (and `--verbose` on the affected commands) emits structured phase logs: per-phase timing, per-behavior eval-gen progress with retry counts, raw LLM input/output on parse/validation failures, and the staging-dir path on transactional operations so users can inspect what would have been written.

## Capabilities

### New Capabilities
- `transactional-writes`: Staged writes with atomic swap and failure rollback for any skillet command that mutates a skill directory.

### Modified Capabilities
- `skill-authoring`: Eval-gen becomes per-behavior (parallel, retry-isolated, smaller model). Spec-import + create paths become transactional. Verbose logging is added to every phase.
- `skill-spec`: Adds optional `frontmatter_extras` field for round-trip preservation of unknown SKILL.md frontmatter keys.
- `cli`: `create` gains `--tools` / `--no-default-tools`. Affected commands gain `--verbose`. `SKILLET_EVAL_GEN_MODEL` and `SKILLET_VERBOSE` env vars added.

## Impact

- New: `src/transactional/` (or similar) — staging dir + swap helpers used by import / regen.
- New: `frontmatter_extras` on `SkillSpec`, parser handling, IO rendering.
- New: `SKILLET_EVAL_GEN_MODEL` resolution alongside `agent` and `judge` in `src/agent/provider.ts`.
- Modified: `src/authoring/phases/eval-gen.ts` — per-behavior parallel calls, must_not in prompt, partial-success semantics.
- Modified: `src/authoring/prompts/eval-gen.ts` — single-behavior shape + must_not awareness.
- Modified: `src/authoring/phases/skill-gen.ts` and `src/authoring/prompts/skill-gen.ts` — render `frontmatter_extras` into output, default tool list for `create`.
- Modified: `src/spec/regen.ts` — call into transactional helpers.
- Modified: `src/commands/spec.ts` (`import` subcommand), `src/commands/create.ts`, `src/commands/improve.ts` — transactional wrapper, verbose flag plumbing.
- Modified: `src/cli.ts` — flag parsing for `--tools`, `--no-default-tools`, `--verbose`.
- New: a small structured logger (`src/log.ts` or similar) that emits phase events with timing and optional payloads.
- No new runtime dependencies.

## Explicit Non-Goals

- Adjacent SPEC.md / EVAL.md ingestion. spec.yaml + `.eval.ts` files already cover the same surface; supporting legacy maintenance docs adds fragility for low value.
- Compare UX polish, auth diagnostics, scoped import. Pure polish, not load-bearing.
- The "rewrite vs create asymmetry" question (whether `improve` should regenerate SKILL.md from scratch vs preserve the original). Separate conversation.
