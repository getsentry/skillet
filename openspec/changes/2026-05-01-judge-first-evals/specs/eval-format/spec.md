# Eval Format — Judge-First Assertions

## REMOVED Requirements

### Requirement: Renderer rejects single-common-English-word patterns

**Reason**: superseded. Regex/substring assertions against
`result.session.outputText` are now banned outright; the
common-English-word check is no longer needed because the
underlying assertion kinds (`output-matches`, `output-contains`,
`output-not-contains`) are removed.

**Migration**: existing files that hand-wrote
`expect(result.session.outputText).toMatch(...)` continue to
load and run. Eval-gen no longer produces them; new generation
uses LLM-rubric judges or structural assertions on
`result.output` / `toolCalls(result.session)`.

## ADDED Requirements

### Requirement: Banned assertion kinds in generated plans

The renderer SHALL reject any plan whose case assertions include
the kinds `output-matches`, `output-contains`, or
`output-not-contains`. These kinds are no longer part of the
supported `Assertion` union — they assert against the agent's
free-form chat reply, which paraphrases between runs and produces
flaky regex/substring checks. The TypeScript type system blocks
them at compile time; the runtime check is defense in depth for
JSON edits arriving from the verifier.

#### Scenario: Banned kind in a plan triggers RenderError
- **GIVEN** a plan whose case includes
  `{ kind: "output-matches", pattern: "..." }`
- **WHEN** `renderEvalFile` is called
- **THEN** it throws `RenderError` naming the assertion kind
- **AND** the error message recommends one of: a named LLM-rubric
  judge, `output-match-object` against `result.output`, or
  `tool-calls`

### Requirement: Multiple judges per file are allowed

The renderer SHALL allow up to 5 named judges per file. Each
judge is still a single named declaration with a 1-property
rubric (≤200 chars per the contract; ≤300 chars per the
renderer's slack). The previous "≤1 judge per file" cap is
removed.

#### Scenario: Three narrow judges per file accepted
- **GIVEN** a plan with three judges, each ≤200 chars, each
  referenced by at least one case
- **WHEN** `renderEvalFile` is called
- **THEN** it succeeds and the rendered file declares all three
  judges at file scope

#### Scenario: More than five judges rejected
- **GIVEN** a plan with six judges
- **WHEN** `renderEvalFile` is called
- **THEN** it throws `RenderError` listing the judges and
  recommending consolidation

### Requirement: Judged cases need no deterministic floor

The renderer SHALL accept cases whose assertion list contains
ONLY `judge` assertions. The previous "every judged case must
have ≥2 deterministic checks" rule is removed; under the
judge-first contract, multiple narrow judges per case is the
canonical shape.

#### Scenario: All-judges case accepted
- **GIVEN** a plan whose case has three `judge` assertions and
  no other assertion kinds
- **WHEN** `renderEvalFile` is called
- **THEN** it succeeds; the rendered case body contains three
  `await expect(result).toSatisfyJudge(...)` lines and nothing
  else
