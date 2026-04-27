## ADDED Requirements

### Requirement: spec.yaml as authoring source of truth

Each skill directory SHALL contain a `spec.yaml` file at the skill root that captures the skill's intent, behavioral clauses, must-not rules, and trigger phrases. `spec.yaml` SHALL be the sole structured input to skill generation. SKILL.md and `evals/*.eval.yaml` SHALL be derived from `spec.yaml` and are not authoritative.

#### Scenario: Spec exists alongside derived artifacts
- **WHEN** a skill directory contains `spec.yaml`, `SKILL.md`, and `evals/*.eval.yaml`
- **THEN** `spec.yaml` is treated as the source of truth and SKILL.md and eval YAMLs are treated as derived artifacts

#### Scenario: Generation derives SKILL.md and evals from spec
- **WHEN** `skillet generate` is run on a skill directory containing `spec.yaml`
- **THEN** SKILL.md and `evals/*.eval.yaml` are written from the spec, overwriting any existing derived files

### Requirement: spec.yaml schema fields

`spec.yaml` SHALL define the following top-level fields: `managed_by` (literal string `skillet`), `spec_version` (integer), `name` (string), `intent` (string), `class` (optional string), `triggers` (object with `should` and `should_not` arrays of strings), `behaviors` (array), `must_not` (array). Unknown top-level fields are reserved and SHALL cause a validation warning.

#### Scenario: Minimum valid spec
- **WHEN** a `spec.yaml` contains `managed_by: skillet`, `spec_version: 1`, `name`, `intent`, and at least one entry in `triggers.should`
- **THEN** the spec parses and validates successfully even with empty `behaviors` and `must_not` arrays

#### Scenario: Missing required field
- **WHEN** `spec.yaml` is missing `name`, `intent`, `managed_by`, or `spec_version`
- **THEN** spec validation reports the missing field and the spec is considered invalid

#### Scenario: Unknown top-level field
- **WHEN** `spec.yaml` contains a top-level field outside the documented schema
- **THEN** spec validation emits a warning naming the unknown field

### Requirement: Behavior schema

Each entry in `behaviors[]` SHALL contain `id` (kebab-case slug, unique within the spec), `statement` (imperative one-line rule the skill must enforce), and optional `rationale` (free text explaining why) and `eval` (block defining a single eval case). The `eval` block SHALL contain optional `setup` (shell setup script), one of `prompt` (string) or `prompts` (single-element array — multi-prompt arrays are reserved for future use), and one of `expect` (literal substring) or `criteria` (judge string). At least one of `expect` or `criteria` SHALL be present when an `eval` block is provided.

#### Scenario: Behavior with eval block
- **WHEN** a behavior has `id`, `statement`, and an `eval` block with `prompt` and `expect`
- **THEN** generation produces one eval case named `<id>__<slug-of-prompt>` testing the behavior

#### Scenario: Behavior without eval block
- **WHEN** a behavior has `id` and `statement` but no `eval`
- **THEN** the eval generator invents an `eval` block using the behavior statement as guidance and writes one case for the behavior

#### Scenario: Duplicate behavior IDs
- **WHEN** two behaviors share the same `id`
- **THEN** spec validation fails with a duplicate-ID error

#### Scenario: Behavior eval missing both expect and criteria
- **WHEN** a behavior provides an `eval` block with neither `expect` nor `criteria`
- **THEN** spec validation reports the missing assertion field

### Requirement: must_not schema

Each entry in `must_not[]` SHALL contain `id` (kebab-case slug, unique within `must_not[]`), `statement` (imperative rule the skill must NOT do), and optional `rationale`, `leakage_risk` (string label), and `eval` block. The `eval` block for must_not entries SHOULD use `criteria` (LLM judge) rather than `expect`, since negative cases commonly trigger on input echo.

#### Scenario: Must-not with criteria-based eval
- **WHEN** a must_not has `id`, `statement`, and an `eval` block with `prompt` and `criteria`
- **THEN** generation produces one negative eval case judged by the criteria

#### Scenario: Must-not entries share namespace with behaviors for IDs
- **WHEN** a must_not entry shares an `id` with a behavior entry
- **THEN** spec validation fails with a duplicate-ID error across the combined namespace

### Requirement: CLI-managed banner

`spec.yaml` SHALL open with a comment banner declaring it is managed by skillet and must not be hand-edited. The banner content SHALL be preserved across all writes performed by skillet.

#### Scenario: Banner present after spec init
- **WHEN** `skillet spec init` writes a new `spec.yaml`
- **THEN** the file's first lines contain a comment banner stating it is managed by skillet and lists `skillet spec --help` as the modification entry point

#### Scenario: Banner preserved across edits
- **WHEN** any `skillet spec` subcommand modifies `spec.yaml`
- **THEN** the banner remains as the first comment block in the file

### Requirement: Spec patch operations

The system SHALL define a closed set of patch operations that can be applied to a spec: `update_intent`, `update_behavior`, `add_behavior`, `remove_behavior`, `update_eval`, `update_must_not`, `add_must_not`, `remove_must_not`, `add_trigger`, `remove_trigger`. The patcher SHALL fail loudly on unknown ops or operations referencing missing IDs.

#### Scenario: Apply update_behavior patch
- **WHEN** a patch `{op: update_behavior, id: foo, field: statement, value: "..."}` is applied to a spec containing behavior `foo`
- **THEN** the behavior's `statement` is updated and the rest of the spec is unchanged

#### Scenario: Apply patch with missing ID
- **WHEN** a patch references a behavior `id` that does not exist in the spec
- **THEN** patch application fails with an error naming the missing ID and the spec is left unchanged

#### Scenario: Apply unknown op
- **WHEN** a patch object has an `op` field not in the documented set
- **THEN** patch application fails with an unknown-op error and the spec is left unchanged
