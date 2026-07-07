## Why

Skillet's authoring pipeline (`LIFECYCLE.md`) has accumulated a
lot of code. Per-phase prompts, the 5-stage eval-gen pipeline
(per-entry fan-out → consolidate → audit → render → write),
skill-gen and skill-improve as separate code paths, reference-gen
as a third, spec-refine as a fourth — each phase gets its own
file, its own prompt, and its own integration glue.

This pays for **deterministic structure** (canonical judge
dedup, render templates, per-stage retry) at the cost of
flexibility, depth, and code that has to evolve in lockstep
across a dozen files when authoring quality moves. The recent
gap analysis vs. `getsentry/skills`'s `skill-writer` showed
where the depth ceiling sits: structure is enforced, but the
content of behaviors and references is shallow because no single
agent owns the authoring story end-to-end.

Shift the model: **skillet becomes orchestration software for a
small number of agents**, each defined as an Anthropic Agent
Skill bundled inside skillet. Authoring quality lives in the
agent's SKILL.md + references, not scattered across phase code.
The orchestrator's job is to sequence agents, route diagnostics
between them, and persist outputs.

## What Changes

- **NEW** `agents/` directory inside skillet, shipping four
  bundled Anthropic Agent Skills:
  - `agents/skill-writer/` — derived from
    `getsentry/skills`'s `skill-writer`, modified to read
    `spec.yaml` (skillet's source of truth) and produce
    SKILL.md + `references/`. Synthesis-path, design-principles,
    reference-architecture, description-optimization, and the
    other skill-writer references come along for the ride.
  - `agents/eval-writer/` — one-shots the entire
    `evals/` tree from `spec.yaml`. Owns vitest-evals contract,
    skillet's structural assertion preferences, judge dedup
    rules, and fixture conventions inside its own SKILL.md +
    references. Does **not** read SKILL.md (decouples eval
    quality from prose tuning).
  - `agents/skill-validator/` — diagnostic-only agent that
    reads `spec.yaml` + `SKILL.md` + `references/` and emits a
    structured diagnostics report (covers/uncovers, drift,
    voice, depth gates).
  - `agents/evals-validator/` — diagnostic-only agent that
    reads `spec.yaml` + `evals/` and emits diagnostics
    (coverage, judge dedup, structural-vs-judge balance,
    fixture sanity).
- **NEW** `agent-orchestration` capability and a small
  `src/agents/` runtime: agent-runner contract, diagnostic
  schema, orchestrator that sequences passes and routes
  diagnostics back to writers for re-passes (max one re-pass
  per writer per cycle by default).
- **MODIFIED** `skill-authoring` capability: phase decomposition
  collapses. `authorSkill()` becomes the orchestrator entry —
  spec-author runs as today (interactive, produces `spec.yaml`),
  then skill-writer + eval-writer run in parallel, then
  skill-validator + evals-validator run in parallel, then if
  any validator emits findings the corresponding writer runs
  once more with the diagnostics as added context. After eval
  run, eval-pass-driven improve invokes skill-writer +
  skill-validator with failing-eval context (same loop, just
  rewired through the writers/validators instead of dedicated
  skill-improve code).
- **REMOVED** `src/authoring/phases/{skill-gen,skill-improve,
  reference-gen,eval-gen,eval-gen-types,eval-gen-render,
  eval-gen-write,eval-gen-audit,eval-gen-consolidate,
  eval-gen-edits}.ts`. The 5-stage eval-gen pipeline
  collapses into one eval-writer pass; skill-gen and
  skill-improve collapse into skill-writer.
- **REMOVED** `src/authoring/prompts/{skill-gen,skill-improve,
  reference-gen,eval-gen,eval-gen-audit-suite,eval-gen-verify}
  .ts` and `_code-eval-contract.ts`. The contract that
  `_code-eval-contract.ts` encoded (assertion shapes, regex
  ban, judge naming, per-file caps) moves into
  `agents/eval-writer/references/eval-contract.md` —
  same content, agent-readable.
- **PRESERVED** spec-author (`src/authoring/phases/spec-author.ts`
  + `src/authoring/prompts/{spec-author,seed-from-description,
  seed-from-skill}.ts`). Spec-author stays as the interactive
  agent producing `spec.yaml`. Other agents may influence
  spec.yaml only by emitting validator diagnostics that the user
  resolves through `skillet spec refine` or hand-edit; writers
  do not patch the spec themselves.
- **PRESERVED** spec-refine (`src/authoring/phases/spec-refine.ts`)
  as the user-initiated path for adding/changing behaviors after
  the spec is committed. Stays unchanged.
- **PRESERVED** CLI surface (`skillet create / improve / eval /
  add-eval / verify / compare`). Public behavior unchanged;
  internal pipeline replaced.
- **PRESERVED** `spec.yaml` schema and `src/spec/`. Source of
  truth doesn't change. Patcher and parser keep their existing
  contracts.
- **PRESERVED** `src/eval/vitest-runner.ts`,
  `src/evals.ts` public surface, `src/evals/*.ts`,
  `src/agent/queue.ts` (AI queue still throttles parallel agent
  passes), `src/agent/provider.ts`, structural validation
  (`src/verify/structural.ts`).

## Impact

- Affected specs: `agent-orchestration` (new), `skill-authoring`
  (modified — phase decomposition removed, orchestrator
  contract added).
- Affected code:
  - **NEW**: `agents/`, `src/agents/orchestrator.ts`,
    `src/agents/runner.ts`, `src/agents/diagnostics.ts`,
    `src/agents/registry.ts`.
  - **DELETED**: 10 phase files under `src/authoring/phases/`,
    7 prompt files under `src/authoring/prompts/`,
    `src/authoring/loop.ts` (replaced by orchestrator).
  - **MODIFIED**: `src/commands/{create,improve,add-eval}.ts`
    — call orchestrator instead of phase loop;
    `LIFECYCLE.md` — rewritten;
    `AGENTS.md` — pipeline pointers updated;
    `policies/skill-creation-lifecycle.md` — refresh.
- Verification: skillet's own evals must still pass (22/22
  baseline). Clean-room regen of warden's `wrdn-authz` and
  `wrdn-gha-workflows` produces skills that pass their own evals
  and feel as good or better than today's output (judged by
  reading the SKILL.md + spec.yaml + a sampling of evals).
- Out of scope: SOURCES.md (separate plan at
  `~/plans/skillet-sources-md.md`), but the agent-orchestration
  shape is what makes that plan trivial to wire later — the
  skill-writer agent owns sources naturally.
