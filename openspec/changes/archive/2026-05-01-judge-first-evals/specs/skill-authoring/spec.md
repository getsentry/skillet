# Skill Authoring — Judge-First Generator and Verifier

## MODIFIED Requirements

### Requirement: Eval-gen prompt teaches the judge-first contract

The generator's system prompt SHALL embed a `CODE_EVAL_CONTRACT`
that:
- Names three first-class assertion shapes: structural via
  `output-match-object`, structural via `tool-calls`, and named
  LLM-rubric judges via `toSatisfyJudge`.
- Bans regex and substring matching against
  `result.session.outputText`.
- Allows multiple narrow judges per file (≤5) and per case.
- Caps each judge criterion at ≤200 characters (1-2 sentences,
  one property).

The same `CODE_EVAL_CONTRACT` constant SHALL be embedded
verbatim in both the generator and the verifier prompts so
generator and critic can't drift.

#### Scenario: Generator emits judge-first plan
- **WHEN** eval-gen runs against a free-form rule (e.g. an
  explanation-quality behavior)
- **THEN** the generated plan has 2-3 narrow named judges in
  `plan.judges` and zero `output-matches` /
  `output-contains` / `output-not-contains` assertions
- **AND** the resulting `.eval.ts` reads as
  `await expect(result).toSatisfyJudge(NameJudge)` lines plus
  any structural assertions where applicable

#### Scenario: Generator emits structural plan when applicable
- **WHEN** the rule is about identifying a specific finding
  shape (severity, trigger, file path, etc.)
- **THEN** the generated plan includes
  `output-match-object` and/or `tool-calls` assertions
  alongside any judges

### Requirement: Verifier checks judge-first contract

The verifier SHALL flag plans that violate the judge-first
contract and return targeted edits. The verifier SHALL NOT
return `tighten-regex` edits (no regex assertions exist
post-ban). The verifier MAY return `split-judge` edits when a
judge bundles multiple properties, and `add-judge` edits when a
case lacks a check for an obvious testable property.

#### Scenario: Verifier splits an overly broad judge
- **GIVEN** a generated plan with a single judge whose criterion
  conflates two properties (e.g. "identifies the trigger AND
  rates severity")
- **WHEN** verify runs
- **THEN** the verifier returns `{ approve: false, edits: [...] }`
  including a `split-judge` edit naming two narrower
  replacements

#### Scenario: Verifier adds a judge for a missing property
- **GIVEN** a generated plan testing a free-form rule but missing
  a check for one obvious property
- **WHEN** verify runs
- **THEN** the verifier returns an `add-judge` edit declaring
  the new judge and listing the cases to wire it into

### Requirement: PlanEdit applier handles split-judge and add-judge

`applyPlanEdits` SHALL apply `SplitJudgeEdit` and
`AddJudgeEdit` in addition to the previously supported edit
kinds. The applier SHALL validate that:
- `split-judge.replacements` is non-empty and each replacement
  has a valid PascalCase name ending in `Judge`.
- `split-judge.caseAssignments` references at least one of the
  replacement names.
- `add-judge.judge.name` is valid AND not already declared in
  the plan.
- `add-judge.caseNames` references real cases.

The applier SHALL throw `PlanEditError` when validation fails so
eval-gen falls back to the original plan with a warning.

#### Scenario: split-judge replaces references across cases
- **GIVEN** a plan with one judge `BroadJudge` referenced by 3
  cases, and a `split-judge` edit declaring `NarrowAJudge` and
  `NarrowBJudge`
- **WHEN** `applyPlanEdits` is applied
- **THEN** the plan declares both narrow judges and no longer
  declares `BroadJudge`
- **AND** each of the 3 cases that referenced `BroadJudge` now
  references `NarrowAJudge` and `NarrowBJudge` in order

#### Scenario: add-judge wires into named cases
- **GIVEN** a plan with 2 cases where neither references a new
  property, and an `add-judge` edit naming both cases
- **WHEN** `applyPlanEdits` is applied
- **THEN** the plan's `judges` includes the new declaration
- **AND** each named case has the new judge appended to its
  assertions

### Requirement: tighten-regex edit is removed

The `TightenRegexEdit` kind SHALL be removed from the
`PlanEdit` union. The verifier prompt SHALL NOT advertise it,
and the applier SHALL fail loudly (with a `PlanEditError`) on
any edit whose `kind` field is `tighten-regex` so invalid edits
from a stale verifier prompt do not silently pass.

#### Scenario: tighten-regex edit is rejected
- **GIVEN** a verifier response containing
  `{ kind: "tighten-regex", caseName: "...", pattern: "..." }`
- **WHEN** `applyPlanEdits` is called
- **THEN** it throws `PlanEditError` naming the unsupported edit
  kind
- **AND** eval-gen falls back to the original plan with a
  warning event
