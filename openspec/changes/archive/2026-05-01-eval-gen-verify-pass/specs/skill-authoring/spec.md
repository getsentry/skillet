# Skill Authoring — Eval-Gen Verify Pass

## ADDED Requirements

### Requirement: Eval-gen runs a verify pass after generation

The eval-gen phase SHALL issue a second LLM call per spec entry
after the generator returns a valid `AssertionPlan`. The verify
call SHALL receive the spec entry, the full must_not list, and the
candidate plan, and SHALL return either `{ approve: true }` or
`{ approve: false, edits: PlanEdit[] }`. The verify call SHALL
NOT loop — it runs exactly once per entry.

#### Scenario: Generator output passes verify
- **GIVEN** the generator produced a plan with deterministic-first
  assertions, ≤1 judge, and a criterion under 200 characters
- **WHEN** verify runs against that plan
- **THEN** verify returns `{ approve: true }`
- **AND** skillet renders the original plan unchanged

#### Scenario: Generator output fails verify
- **GIVEN** the generator produced a plan with a case whose only
  assertion is a judge
- **WHEN** verify runs
- **THEN** verify returns `{ approve: false, edits: [...] }` with
  at least one `add-deterministic` or
  `replace-judge-with-deterministic` edit targeting that case

#### Scenario: Verify is single-pass
- **GIVEN** verify returned edits and skillet applied them
- **WHEN** the resulting plan still has issues
- **THEN** skillet does not call verify again
- **AND** the (possibly imperfect) edited plan is rendered and
  written

### Requirement: PlanEdit types and applier

Skillet SHALL define a `PlanEdit` discriminated union covering at
least the kinds: `drop-judge`,
`replace-judge-with-deterministic`, `tighten-regex`,
`shorten-criterion`, `add-deterministic`, `drop-assertion`. A
pure `applyPlanEdits(plan, edits)` function SHALL apply edits in
input order and return the resulting plan.

#### Scenario: drop-judge removes declaration and references
- **GIVEN** a plan with `judges: [PwnJudge]` and a case whose
  assertions include `{ kind: "judge", judgeName: "PwnJudge" }`
- **WHEN** `applyPlanEdits` is called with
  `[{ kind: "drop-judge", judgeName: "PwnJudge" }]`
- **THEN** the resulting plan has `judges: []` AND the case's
  assertions no longer include the judge reference

#### Scenario: replace-judge-with-deterministic substitutes
- **GIVEN** a plan whose only judge `SeverityJudge` is referenced
  by 3 cases
- **WHEN** `applyPlanEdits` is called with a
  `replace-judge-with-deterministic` edit naming `SeverityJudge`
  and supplying two replacement assertions
- **THEN** all 3 cases have their `judge` reference removed AND
  the two replacement assertions appended in their place
- **AND** the judge declaration is removed from `plan.judges`

#### Scenario: Edit with missing target throws
- **GIVEN** a plan that does not declare `MissingJudge`
- **WHEN** `applyPlanEdits` is called with
  `[{ kind: "drop-judge", judgeName: "MissingJudge" }]`
- **THEN** the function throws an error naming the missing target

### Requirement: Verify-pass failure falls back to the original plan

Skillet SHALL fall back to the original generator-produced plan
when applying the verifier's edits produces a plan that fails
`validatePlan` or fails subsequent rendering. Skillet SHALL emit a
warning event naming the entry, the verifier's edit count, and
the validation/render error so users can audit verify-pass
quality.

#### Scenario: Edited plan invalid → fall back
- **GIVEN** verify returns edits that, when applied, produce a
  plan rejected by the renderer
- **THEN** skillet writes the renderer output for the unedited
  plan
- **AND** emits a warning event including the render error

### Requirement: Generator and verifier share hard caps

Skillet SHALL express the hard caps governing eval files (max 1
judge per file, max 200 characters per `criterion`, min 2
deterministic assertions per judged case, banned single-
English-word patterns) as a single shared constant string. Both
the generator system prompt and the verifier system prompt SHALL
import that constant; neither SHALL inline the values
independently.

#### Scenario: Adjusting a cap propagates to both prompts
- **WHEN** the shared caps constant is edited (e.g. raising the
  criterion cap from 200 to 250)
- **THEN** both `buildEvalGenPrompt()` and
  `buildEvalGenVerifyPrompt()` reflect the new value without any
  duplicate edits

### Requirement: Verify pass uses the AI queue

The verify call SHALL submit through `submitAiJob` with a name of
the form `eval-gen:verify:<entry-id>` so it shows up in the
end-of-command telemetry summary alongside the generator calls.

#### Scenario: Verify call appears in summary
- **WHEN** `skillet create` or `skillet add-eval` runs and
  triggers eval-gen
- **THEN** the end-of-command summary includes
  `eval-gen:verify:*` jobs with success / failure counts
