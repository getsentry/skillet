# Judge-First Evals — Ban Regex/String Matching on Free-Form Agent Output

## Why

The previous "deterministic-first" contract pushed eval-gen toward
regex and substring matching against `result.session.outputText` —
the agent's free-form chat reply. These checks are brittle: the
agent paraphrases, expands, or splits sentences differently between
runs; the regex either matches by accident (false pass) or misses
by accident (false fail). They test the assertion's grammar more
than the agent's behavior.

vitest-evals#41 supports two first-class assertion patterns:

1. **Structural assertions** on `result.output` (when the skill
   emits structured output, e.g. a JSON finding block) and on
   `toolCalls(result.session)` — `expect(...).toMatchObject(...)`,
   `toEqual(...)`, etc. Upstream's demos lean on these because the
   demo agent produces structured output.
2. **Named LLM-rubric judges** declared with
   `judge("Name", async ({ criterion }) => criterion("…"))` and
   asserted with `await expect(result).toSatisfyJudge(NamedJudge)`.
   Each judge tests one property; multiple judges per case is
   normal.

Skillet's domain (security review, code recommendation) often
produces free-form text — but free-form text is exactly what regex
is bad at and what an LLM-rubric judge is good at. The pivot:
**ban regex/substring matching on free-form agent output; lean
into the two first-class patterns instead**.

## What Changes

- **REMOVED** Assertion kinds `output-matches`, `output-contains`,
  `output-not-contains`. The renderer rejects any plan that uses
  them; the generator prompt drops them from the schema.
- **MODIFIED** Code-eval contract: judge-first. The contract
  declares that assertions on free-form agent text are banned;
  every assertion must be either structural
  (`output-match-object`, `tool-calls`) or a named LLM-rubric
  judge.
- **MODIFIED** Multiple judges per file and per case are
  allowed. The "≤1 judge per file" cap is dropped; the "≥2
  deterministic per judged case" cap is dropped (a case can be
  100% judges). Each judge is still capped at ≤200 chars
  (generator) / ≤300 chars (renderer) so judges stay narrow and
  scoped to one property.
- **MODIFIED** Generator prompt teaches:
  - Structural-first when the skill emits structured output
    (JSON finding block) — use `output-match-object` and
    `tool-calls`.
  - Judge-first when the skill emits free-form text — declare
    multiple narrow named judges, one per testable property
    (e.g. `IdentifiesPrivilegedTriggerJudge`,
    `RatesHighSeverityJudge`, `ConnectsExploitChainJudge`).
- **MODIFIED** Verifier prompt mirrors the new contract. Edit
  kinds:
  - REMOVED `tighten-regex` (no regex assertions left to
    tighten).
  - ADDED `split-judge` (1 broad judge → 2+ narrow judges).
  - ADDED `add-judge` (declare a new judge and reference it
    from named cases).
  - KEPT `drop-judge`, `replace-judge-with-deterministic`,
    `shorten-criterion`, `add-deterministic`, `drop-assertion`.
- **MODIFIED** PlanEdit applier handles `split-judge` and
  `add-judge`; drops `tighten-regex`.
- **MODIFIED** Renderer cap message migration: when an old plan
  contains a banned assertion kind, the `RenderError` explains
  the ban and points at the recommended replacement (judge for
  free-form properties; toMatchObject for structured output).

## Non-Goals

- **Forcing skills to emit structured findings.** That's a
  separate concern (skill-gen prompt). When skills do emit
  structure, evals should use it; when they don't, evals fall
  back to LLM-rubric judges.
- **Removing the `judge()` factory's body flexibility.** Judges
  can still contain arbitrary code logic
  (`opts.output.includes(...)`, `opts.run.session.messages.length`,
  etc.). The constraint is on what assertion kinds the eval-gen
  *plan* offers; hand-edited eval files retain full flexibility.
- **Migrating existing on-disk eval files.** Generated files from
  before this change still load (the legacy data-array
  describeEval keeps working); the renderer's ban applies to new
  generation only. Old files using the banned kinds keep running
  until they're regenerated.
- **Removing `not.toContain` literals from skill author hand-edits.**
  When a human writes a `.eval.ts` directly, vitest doesn't care.
  The ban is on what eval-gen produces.

## Capabilities Touched

- `eval-format` — banned assertion kinds, multiple-judges
  allowance.
- `skill-authoring` — generator/verifier prompts, plan-edit
  changes.
