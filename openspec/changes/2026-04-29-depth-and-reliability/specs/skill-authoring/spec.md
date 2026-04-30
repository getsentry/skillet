## ADDED Requirements

### Requirement: Domain Expert Authoring Depth

Skill creation SHALL apply class-specific depth gates before finalizing a spec.

#### Scenario: Security-review skill from concise description
- **WHEN** `skillet create` receives a description for a broad security-review
  skill
- **THEN** the generated spec includes detection behaviors, investigation
  workflow, false-positive controls, severity/output calibration, and
  neighboring vulnerability classes to avoid

#### Scenario: Broad domain expert skill
- **WHEN** the requested skill covers multiple frameworks, providers, or
  product-specific contexts
- **THEN** the spec captures conditional reference-loading guidance or equivalent
  framework/product routing behavior rather than a shallow single-path workflow

### Requirement: Spec-Driven Reference Artifacts

Skill creation SHALL support durable reference files for guidance that is too
large or contextual to inline into SKILL.md.

#### Scenario: Domain expert spec declares references
- **WHEN** `spec.yaml` includes `references[]` entries
- **THEN** regeneration creates each missing `references/<slug>.md` file
- **AND** existing reference files are preserved without overwrite
- **AND** SKILL.md includes concise runtime loading guidance for the declared
  references

#### Scenario: Missing declared reference
- **WHEN** verification runs for a spec that declares a reference path
- **AND** the reference file is missing
- **THEN** verification reports a deterministic coverage issue

### Requirement: Interruptible Spec Planning

Skill creation SHALL allow the spec-planning phase to stop with a human-facing
clarification when a high-impact ambiguity would materially change the generated
behaviors and evals.

#### Scenario: Underdetermined target domain
- **WHEN** the skill description leaves target framework family, source set, or
  neighboring-domain scope genuinely ambiguous
- **THEN** spec-init may return a single concise question for the skill owner
- **AND** Skillet reports that the question needs to be asked of a fellow human
  instead of silently generating a shallow or wrong spec

#### Scenario: Low-impact ambiguity
- **WHEN** the ambiguity is cosmetic or safely correctable later with
  `skillet spec refine`
- **THEN** spec-init makes a reasonable assumption and continues

### Requirement: Staged Regeneration Isolation

Authoring commands SHALL avoid mutating live skill files until staged
regeneration succeeds.

#### Scenario: Regeneration fails after staging existing files
- **WHEN** a command stages an existing skill and then fails during regeneration
- **THEN** the live `SKILL.md`, eval files, and reference files remain unchanged
- **AND** staged writes are discarded rather than partially committed
