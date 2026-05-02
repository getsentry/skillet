## ADDED Requirements

### Requirement: Interactive Spec-Author Loop

Skill creation SHALL run an interactive multi-turn `spec-author` loop with the
user before generation. The loop SHALL terminate only when the user accepts a
spec that passes class-driven depth gates.

#### Scenario: User accepts on first turn
- **WHEN** the seeded spec already passes class gates and the user accepts
- **THEN** the loop terminates after one turn and generation proceeds

#### Scenario: Loop asks questions when gates fail
- **WHEN** the current spec is missing class-required dimensions or references
- **THEN** the loop returns proposal plus targeted questions to fill the gaps
- **AND** the loop does not propose generation until gates pass

#### Scenario: User overrides class
- **WHEN** the user changes the proposed `class` in dialogue
- **THEN** subsequent gate checks use the new class's required dimensions and
  reference topics

### Requirement: Class-Driven Depth Gates

Skill creation SHALL refuse to finalize a spec whose `class` requires
dimensions or reference topics not present on the spec.

#### Scenario: Security-review missing false-positive references
- **WHEN** a `security-review` spec lacks any reference whose `topics`
  includes `false-positive-traps`
- **THEN** structural validation fails with a deterministic missing-reference
  error before generation

#### Scenario: Generic class skips gates
- **WHEN** the spec's class is `generic`
- **THEN** no class-required dimensions or reference topics are enforced

### Requirement: Three Seed Strategies

`spec-author` SHALL accept three seed inputs that all produce the same `Spec`
shape: a natural-language description, an existing skill directory, or an
in-progress improve session with eval failures.

#### Scenario: Description seed
- **WHEN** `skillet create` is run with a description
- **THEN** `seed/from-description.ts` produces a draft spec including a
  proposed class, and the author loop runs

#### Scenario: Existing skill seed
- **WHEN** `skillet spec init` is run against an existing skill directory
- **THEN** `seed/from-skill.ts` parses the SKILL.md and references and emits a
  draft spec, and the author loop runs

#### Scenario: Improve seed
- **WHEN** `skillet improve` cannot resolve eval failures with prompt-only
  edits
- **THEN** `seed/from-improve.ts` emits a draft delta to the existing spec and
  the author loop runs over that delta

## REMOVED Requirements

### Requirement: Interruptible Spec Planning

**Reason:** Replaced by the multi-turn `spec-author` loop. The loop covers the
same need (asking the user when ambiguity is high-impact) without exception-
as-control-flow and without limiting interaction to a single question.

**Migration:** Existing `PhaseInterruptedForHumanInput` call sites are removed;
`spec-author` runs inline in `commands/create.ts` and `commands/spec.ts`.
