# Skill Creation Lifecycle

How a skill is built end-to-end. Authoritative reference for the
authoring flow — what runs, in what order, and what gets written.

Load-bearing: keep current as the flow changes. See
`policies/skill-creation-lifecycle.md`.

---

## Commands

- **`skillet create <description>`** — spec-author (interactive) →
  skill-gen → eval-gen → improve loop. Full from-scratch path.
- **`skillet improve [path]`** — spec-refine on an existing or
  legacy-imported skill, then re-run skill-gen + eval-gen +
  improve loop for changed entries.
- **`skillet add-eval [path] "behavior"`** — append one
  behavior/must_not via spec-refine, regen evals across the whole
  suite (consolidation always runs full-suite).
- **`skillet eval [path]`** — vitest run, no generation.
- **`skillet compare <a> <b>`** — run A's evals against A's and
  B's SKILL.md side-by-side.
- **`skillet verify [path]`** — structural agreement of
  spec.yaml + SKILL.md + evals/; `--semantic` adds LLM-judged
  trigger and dimension coverage.

`spec.yaml` is the source of truth. SKILL.md, references, and
evals all derive from it.

---

## Eval-gen pipeline

The most elaborate phase. Five stages, three LLM-bound:

```
spec.yaml + SKILL.md
        │
        ▼
  1. Per-entry fan-out (LLM, parallel, throttled by AI queue)
       a. Generate plan        ← LLM
       b. Verify plan          ← LLM (in same queue slot)
       c. Apply plan-edits     ← in-process, falls back on failure
        │
        ▼
  2. Consolidate (deterministic)
       - dedupe judges by exact name (first criterion wins)
       - extract per-case fixtures into fixtures/<slug>/
        │
        ▼
  3. Audit (LLM, single pass over the full deduped suite)
       - propose merge-judges edits to collapse semantic duplicates
       - non-fatal: bad parses approve as-is
        │
        ▼
  4. Render (deterministic)
       - evals/_judges.ts (canonical judge set)
       - evals/<entry-id>.eval.ts (per-behavior file)
        │
        ▼
  5. Write (idempotent file I/O)
```

Existing `<entry-id>.eval.ts` files are skipped at stage 1 and
excluded from consolidation; `_judges.ts` is overwritten if any
entry changes.

The generator and verifier share a single contract string —
`CODE_EVAL_CONTRACT` in
`src/authoring/prompts/_code-eval-contract.ts` — defining the
three first-class assertion shapes (`output-match-object`,
`tool-calls`, `judge`), the regex/substring ban, per-file caps,
and canonical judge naming stems.

---

## Output layout

```
skills/<skill>/
├── SKILL.md                  ← skill-gen output
├── spec.yaml                 ← source of truth
├── references/<topic>.md     ← reference-gen output
└── evals/
    ├── _judges.ts            ← canonical deduped judges
    ├── fixtures/<slug>/…     ← per-case workspace seeds
    └── <entry-id>.eval.ts    ← per-behavior eval
```

---

## Pointers

- Commands: `src/commands/`
- Phases: `src/authoring/phases/`
  (`spec-author`, `skill-gen`, `skill-improve`, `spec-refine`,
  `reference-gen`, `eval-gen` + its `eval-gen-{types,consolidate,
  audit,render,write,edits}` sub-modules)
- Prompts: `src/authoring/prompts/` (shared contract:
  `_code-eval-contract.ts`)
- Harness: `src/harness/index.ts`
- Public `@sentry/skillet/evals` surface: `src/evals.ts`
  (re-exports `vitest-evals` + skillet helpers in `src/evals/`)
- AI queue: `src/agent/queue.ts`
- Spec parser/patcher: `src/spec/`
