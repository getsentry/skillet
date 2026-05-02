# Skill Authoring — Eval-Gen Plan + Renderer

## MODIFIED Requirements

### Requirement: Eval-gen LLM emits an assertion plan, not TypeScript

The eval-gen phase's LLM call SHALL produce a structured assertion
plan (JSON), not finished TypeScript. Skillet SHALL render the
`.eval.ts` file from the plan via a deterministic renderer.

The plan SHALL be a JSON object with two top-level fields: `judges`
(zero or more named LLM-judge declarations, each with `name` and
plain-text `criterion`) and `cases` (one or more case plans, each
with `name`, `tests_behavior`, `input`, optional `setup`, optional
`timeout`, and `assertions`). Each assertion SHALL be one of the
following discriminated kinds: `output-matches`, `output-contains`,
`output-not-contains`, `output-match-object`, `tool-calls`, or
`judge`.

#### Scenario: LLM returns plan, skillet writes file
- **WHEN** eval-gen runs for a spec entry
- **THEN** the LLM call returns a JSON plan
- **AND** skillet validates the plan and renders the `.eval.ts` file
  via `renderEvalFile(entryId, plan)`
- **AND** the LLM never produces TypeScript directly

#### Scenario: Invalid plan retries
- **WHEN** the LLM returns malformed JSON, an unknown assertion
  kind, or a `judge` assertion referencing a name not declared in
  `plan.judges`
- **THEN** eval-gen treats the response as a parse failure, surfaces
  the diagnostic via `saveFailedOutput`, and retries up to
  `MAX_ATTEMPTS_PER_ENTRY`

### Requirement: Eval-gen prefers deterministic assertions

The eval-gen prompt SHALL instruct the LLM to prefer deterministic
assertion kinds (`output-matches`, `output-contains`,
`output-match-object`, `tool-calls`) over LLM judges. A `judge`
assertion SHALL be used only when the rule under test is genuinely
semantic (e.g. quality of reasoning, correct connection between
concepts) and cannot be expressed structurally.

When a behavior's rule maps to a load-bearing keyword the agent
must emit (e.g. severity tag, finding label), the LLM SHALL emit
an `output-matches` regex with explicit word boundaries
(`\bHIGH\b`) rather than a bare substring.

When more than one case is generated for the same behavior, the
LLM SHALL declare at most one `judge` (named for the behavior) and
reuse it across all judged cases for that behavior.

#### Scenario: Severity check uses regex with boundaries
- **GIVEN** a behavior whose statement requires the agent to assign
  a severity of HIGH/MEDIUM/LOW
- **WHEN** eval-gen produces a plan
- **THEN** the plan includes an `output-matches` assertion with a
  pattern containing `\b(HIGH|MEDIUM|LOW)\b` rather than a bare
  substring

#### Scenario: One judge per behavior, reused across cases
- **GIVEN** a behavior with three generated cases that all need
  semantic checking
- **WHEN** the plan is rendered
- **THEN** `plan.judges` contains exactly one entry, named for the
  behavior, and each of the three cases' `judge` assertions
  references that one judge by name

### Requirement: Renderer rejects suspicious deterministic assertions

The renderer SHALL reject and bubble back as a retry signal any
plan whose `output-matches` patterns are suspicious (a bare
all-caps token without word boundaries, an empty pattern, or a
pattern that would match the case's own input verbatim).

#### Scenario: Bare /HIGH/ rejected
- **WHEN** an `output-matches` assertion uses pattern `HIGH` with
  no word boundaries
- **THEN** the renderer rejects the plan and eval-gen retries with
  a diagnostic indicating the bare-token pattern

#### Scenario: Pattern matches input verbatim rejected
- **WHEN** an `output-matches` pattern is also a substring of the
  case's `input`
- **THEN** the renderer rejects the plan (the agent could "pass" by
  echoing the input)

### Requirement: Eval-gen prompt teaches the assertion plan

The eval-gen system prompt (`buildEvalGenPrompt`) SHALL document
the assertion-plan schema, the deterministic-first preference, and
include at least two worked examples — one positive behavior, one
must_not — showing the JSON plan inline so the LLM can pattern-
match.

#### Scenario: Prompt includes worked examples
- **WHEN** the prompt is rendered for any spec entry
- **THEN** the prompt body contains both a positive and a must_not
  example with full JSON plans (judges + cases + assertions)
