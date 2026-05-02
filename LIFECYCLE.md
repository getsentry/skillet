# Skill Creation Lifecycle

This document describes how a skill gets built end-to-end inside
skillet. It is the canonical reference for the agent-authoring
flow — what stages run, in what order, what LLM calls each stage
makes, what artifacts get written.

This file is **load-bearing**: contributors keep it current as the
flow changes. See `policies/skill-creation-lifecycle.md`. If a
change to the flow lands without updating this file, the change
isn't done.

---

## Commands and their lifecycles

### `skillet create <description>`

```
[user description]
       │
       ▼
┌──────────────────────────┐
│ 1. spec-author phase     │  agentic, multi-turn
│   (interactive or auto)  │  reads --input dirs for research
│                          │  produces spec.yaml
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│ 2. skill-gen phase       │  one LLM call per spec entry
│   spec → SKILL.md        │  + reference-gen for any references
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│ 3. eval-gen phase        │  see "Eval-gen lifecycle" below
│   spec → evals/          │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│ 4. improve loop          │  up to N iterations:
│   run evals → assess     │  - run vitest evals
│   → spec-refine →        │  - LLM judges results
│   → regenerate           │  - propose spec patches
└──────────────────────────┘  - apply + regen until pass
```

`skillet create` is the full "from-scratch" path. The spec-author
phase produces the source-of-truth `spec.yaml`; everything
downstream derives from it.

### `skillet improve [path]`

```
[existing skill or legacy import]
       │
       ▼
┌──────────────────────────┐
│ spec-refine phase        │  LLM proposes spec patches based on
│   reads SKILL.md, evals  │  observed gaps; user accepts/edits
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│ skill-gen + eval-gen     │  same as `create` for changed entries
└────────────┬─────────────┘
             │
             ▼
   improve loop (same)
```

Used to upgrade a published skill or import a legacy hand-written
one. The improve loop runs the same evals → judge → refine
cycle as `create`.

### `skillet add-eval [path] "behavior"`

```
[behavior statement]
       │
       ▼
┌──────────────────────────┐
│ spec patch (new entry)   │  one new behavior or must_not
│ → eval-gen for that      │  cross-suite consolidate runs
│   entry → consolidate    │  again across the whole skill,
│   → write evals/         │  re-rendering _judges.ts and
└──────────────────────────┘  any newly-shared judges
```

Adds a single behavior or must_not and regenerates the eval
artifacts for the whole skill (consolidation always runs across
the full set so judges and fixtures stay coherent).

### `skillet eval [path]`

Spawns vitest against the skill's `evals/` directory. Doesn't
generate anything; just runs.

### `skillet compare <a> <b>`

Runs A's evals once against A's SKILL.md and once against B's
SKILL.md (via `SKILLET_COMPARE_SKILL` env var read by the
harness). Side-by-side LLM-as-judge comparison.

### `skillet verify [path]`

Structural validation that spec.yaml + SKILL.md + evals/ agree.
With `--semantic`, also runs LLM-judged trigger and dimension
coverage checks.

---

## Eval-gen lifecycle

The eval-gen phase is the most elaborate and the most actively
iterated. Today it has **five stages**, three LLM-bound and two
deterministic:

```
spec.yaml + SKILL.md
        │
        ▼
┌────────────────────────────────────────┐
│  1. Per-entry fan-out (LLM, parallel)  │
│                                        │
│  For each behavior/must_not:           │
│    a. Generate plan (eval-gen:<id>)    │
│         → AssertionPlan, parse-retry   │
│           up to MAX_ATTEMPTS_PER_ENTRY │
│    b. Verify plan (LLM, single-pass)   │
│         → approve | PlanEdit[]         │
│    c. Apply edits if any (in-process)  │
│         → final AssertionPlan          │
│                                        │
│  Throttled by AI queue concurrency.    │
│  Failures isolated per-entry.          │
└────────────────┬───────────────────────┘
                 │ all entries collected
                 ▼
┌────────────────────────────────────────┐
│  2. Consolidate (deterministic, no LLM)│
│                                        │
│  - Dedupe judges by exact name match   │
│    (canonical = first-encountered      │
│     criterion; same-name + divergent   │
│     criteria → warn + keep first)      │
│  - Extract fixtures: each case's       │
│    `fixture` map → fixtures[<slug>]    │
│  - Rewrite plans → ConsolidatedPlan    │
│    with fixtureSlug instead of inline  │
│    content; judges referenced by name  │
└────────────────┬───────────────────────┘
                 ▼
┌────────────────────────────────────────┐
│  3. Render (deterministic, no LLM)     │
│                                        │
│  - renderJudgesFile(judges) →          │
│      evals/_judges.ts                  │
│  - For each ConsolidatedPlan:          │
│      renderEvalFile(entryId, plan,     │
│        sharedJudges) →                 │
│      evals/<entry-id>.eval.ts          │
└────────────────┬───────────────────────┘
                 ▼
┌────────────────────────────────────────┐
│  4. Write (deterministic, I/O)         │
│                                        │
│  - evals/_judges.ts (1× per skill)     │
│  - evals/fixtures/<slug>/<rel-path>    │
│    (one tree per case with a fixture)  │
│  - evals/<entry-id>.eval.ts            │
└────────────────────────────────────────┘
```

### Per-entry stage details

**Generate (`generateForEntry`)**

- Submitted to the AI queue as `eval-gen:<entry-id>`.
- LLM call uses `buildEvalGenPrompt()` which embeds
  `CODE_EVAL_CONTRACT` (the shared agreement between generator
  and verifier).
- Returns an `AssertionPlan` (judges + cases + assertions).
- Parse-retry loop with `MAX_ATTEMPTS_PER_ENTRY = 3`. Each
  attempt validates JSON shape, validates `validatePlan`'s
  contract caps, and runs `validateCaseFixtures` (preflights
  fixture writes through `createWorkspace`).
- Source: `src/authoring/phases/eval-gen.ts:generateForEntry`,
  prompt at `src/authoring/prompts/eval-gen.ts`.

**Verify (`verifyPlan`)**

- LLM call (NOT a separate queue job — runs inside the outer
  generate slot to avoid queue re-entrancy deadlock).
- Uses `buildEvalGenVerifyPrompt()`, also embedding
  `CODE_EVAL_CONTRACT`.
- Returns `{ approve: true } | { approve: false, edits: PlanEdit[] }`.
- Single-pass; bad parses fall through to `{ approve: true }`
  rather than blocking the entry.
- Source: `src/authoring/phases/eval-gen.ts:verifyPlan`,
  prompt at `src/authoring/prompts/eval-gen-verify.ts`.

**Apply edits (`applyEditsSafely`)**

- In-process, no LLM. Calls `applyPlanEdits` then re-validates
  via `validatePlan`.
- On any failure (bad edit, post-edit invalid plan): falls back
  to the original generator plan and emits a warn event.
- Source: `src/authoring/phases/eval-gen-edits.ts`.

### Cross-suite stages

**Consolidate (`consolidate`)**

- Pure function over all per-entry plans.
- Dedupe heuristic: **exact judge-name match**. First-encountered
  criterion wins for a given name. Conflicts (same name,
  divergent criterion) are non-fatal; surfaced as warn events.
- Extracts each case's `fixture` (file map) into a separate
  `fixtures` record keyed by case slug; the per-entry plan
  retains `fixtureSlug` instead of inline content.
- Source: `src/authoring/phases/eval-gen-consolidate.ts`.

**Render (`renderEvalFile`, `renderJudgesFile`)**

- Pure functions, no I/O.
- `renderJudgesFile(judges)` → `evals/_judges.ts` content.
- `renderEvalFile(entryId, plan, sharedJudges)` → per-entry
  `.eval.ts` content. Imports the judges this entry's cases
  reference from `./_judges.js`; emits
  `await harness.useFixture(<slug>)` when a case has a fixture
  on disk.
- Source: `src/authoring/phases/eval-gen-render.ts`.

**Write (`writeArtifacts`)**

- Sequential file writes (idempotent — overwrites OK).
- Respects existing eval files per behavior: an entry whose
  `<entry-id>.eval.ts` already exists on disk is skipped during
  the per-entry stage and its plan is NOT collected, so
  consolidation runs only across new entries. (Existing
  `_judges.ts` is overwritten if any entry changes it.)
- Source: `src/authoring/phases/eval-gen.ts:writeArtifacts`.

### Output layout

```
skills/<skill>/
├── SKILL.md                     ← skill body (skill-gen output)
├── spec.yaml                    ← source of truth
├── references/                  ← reference-gen output
│   └── <topic>.md
└── evals/
    ├── _judges.ts               ← canonical deduped judges
    ├── fixtures/                ← per-case workspace seeds
    │   └── <case-slug>/
    │       └── <rel-path>       ← real readable file
    └── <entry-id>.eval.ts       ← per-behavior eval, imports
                                   from _judges.js, calls
                                   harness.useFixture(<slug>)
```

---

## The code-eval contract

Both the eval-gen generator and verifier share a single string
constant — `CODE_EVAL_CONTRACT` in
`src/authoring/prompts/_code-eval-contract.ts` — that defines:

- The three first-class assertion shapes (`output-match-object`,
  `tool-calls`, `judge`).
- The ban on regex/substring matching against
  `result.session.outputText`.
- Per-entry caps (≤5 judges per file, criterion ≤200 chars,
  every declared judge must be referenced).
- Canonical naming stems
  (`Identifies…Judge`, `Rates…Judge`, `Connects…Judge`,
  `Distinguishes…Judge`, `Recommends…Judge`, `Explains…Judge`,
  `Includes…Judge`, `DoesNotFlag…Judge`,
  `DoesNotFabricate…Judge`, `DoesNotRecommend…Judge`).

The contract is shared by both prompts so the generator and
verifier check against exactly the same rules.

---

## AI queue + concurrency

All LLM-bound work goes through `submitAiJob` in
`src/agent/queue.ts`. The queue:

- Caps concurrency (`SKILLET_AI_CONCURRENCY`, default 4).
- Enforces per-job wall-clock deadlines.
- Emits structured telemetry (`onJobEvent` subscription used by
  the end-of-command summary).
- Does NOT retry — `completeWithBackoff` owns per-call transient
  retry; the queue is the throttle and budget.

Jobs are named with a `<phase>:<key>` convention:

- `eval-gen:<entry-id>` — per-entry generate (the verify call
  runs inside this slot)
- `eval-gen-consolidate` — telemetry-only, no actual job
- `judge` — eval LLM judge call at vitest run time
- `verify-semantic:<batch>` — semantic verify
- `verify-triggers` — trigger-quality verify
- `spec-author:<turn>` — spec-author per-turn
- `reference-gen:<path>` — per-reference gen
- `skill-gen` / `skill-improve` / `spec-refine` — single-shot
  phases

---

## Open work

The lifecycle still has a recognized weakness: **cross-suite
judge dedup is exact-name match only**, so semantically
equivalent judges with slightly different names
(`RecommendsEnvWithQuotingJudge` vs
`RecommendsEnvQuotingAsHardeningJudge`) ship as separate
canonical entries. The contract steers the LLM toward stable
names, and the verifier flags non-canonical names with
`rename-judge` edits, but the verifier sees one entry at a time.

A future iteration may add a **post-consolidate audit pass** —
a single LLM call that sees the full deduped plan + judge set
and proposes cross-suite renames for semantic duplicates —
and/or a **pre-pass palette generator** that produces a
canonical judge set from the full spec before per-entry
generation runs.

When that lands, this section gets rewritten to match.

---

## Pointers

- Commands: `src/commands/{create,improve,add-eval,eval,compare,verify}.ts`
- Phases: `src/authoring/phases/{spec-author,skill-gen,skill-improve,spec-refine,reference-gen,eval-gen}.ts`
- Eval-gen sub-modules:
  - Types: `src/authoring/phases/eval-gen-types.ts`
  - Renderer: `src/authoring/phases/eval-gen-render.ts`
  - Consolidator: `src/authoring/phases/eval-gen-consolidate.ts`
  - Plan-edit applier: `src/authoring/phases/eval-gen-edits.ts`
  - Diagnostics: `src/authoring/phases/_diagnostics.ts`
  - Retry harness: `src/authoring/phases/_retry.ts`
- Prompts: `src/authoring/prompts/`
  - Shared contract: `_code-eval-contract.ts`
  - Eval-gen generator: `eval-gen.ts`
  - Eval-gen verifier: `eval-gen-verify.ts`
- Harness: `src/harness/index.ts`
- Mini-lib (vitest-evals#41 mirror): `src/vitest-evals/`
- AI queue: `src/agent/queue.ts`,
  `src/agent/complete-with-backoff.ts`
- Spec parser/patcher: `src/spec/`
