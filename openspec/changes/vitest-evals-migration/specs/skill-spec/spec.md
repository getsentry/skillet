## MODIFIED Requirements

### Requirement: Behavior schema

Each entry in `behaviors[]` SHALL contain `id` (kebab-case slug, unique within the spec) and `statement` (imperative one-line rule the skill must enforce). Optional field: `rationale` (free text explaining why). The `eval` block is removed from the schema — eval details belong in the generated eval file, not in the spec.

#### Scenario: Behavior with id and statement
- **WHEN** a behavior has `id` and `statement`
- **THEN** spec validation passes

#### Scenario: Behavior with rationale
- **WHEN** a behavior has `id`, `statement`, and `rationale`
- **THEN** spec validation passes and the rationale is preserved

#### Scenario: Legacy behavior with eval block
- **WHEN** a behavior in an existing spec.yaml contains an `eval` key
- **THEN** the parser silently ignores the `eval` key without error; the behavior is valid

#### Scenario: Duplicate behavior IDs
- **WHEN** two behaviors share the same `id`
- **THEN** spec validation fails with a duplicate-ID error

### Requirement: must_not schema

Each entry in `must_not[]` SHALL contain `id` (kebab-case slug, unique within `must_not[]`) and `statement` (imperative rule the skill must NOT do). Optional fields: `rationale`, `leakage_risk`. The `eval` block is removed from the schema.

#### Scenario: Must-not with id and statement
- **WHEN** a must_not has `id` and `statement`
- **THEN** spec validation passes

#### Scenario: Legacy must_not with eval block
- **WHEN** a must_not in an existing spec.yaml contains an `eval` key
- **THEN** the parser silently ignores the `eval` key without error

### Requirement: Patch operations

The `SpecPatch` union SHALL NOT include `update_eval`. The remaining ops are: `update_intent`, `update_behavior` (fields: `statement`, `rationale`), `add_behavior`, `remove_behavior`, `update_must_not`, `add_must_not`, `remove_must_not`, `add_trigger`, `remove_trigger`.

#### Scenario: update_eval patch is rejected
- **WHEN** a patch array contains `{ op: "update_eval", ... }`
- **THEN** the patcher rejects it as an unknown operation

#### Scenario: update_behavior patches statement
- **WHEN** a patch contains `{ op: "update_behavior", id: "x", field: "statement", value: "..." }`
- **THEN** the behavior's statement is updated

## REMOVED Requirements

### Requirement: BehaviorEval type and eval field
**Reason**: Eval implementation details do not belong in the user-facing spec. The spec captures intent (what the skill does); eval files capture verification (how to test it). Removing the eval block makes the spec simpler to read and edit.
**Migration**: Existing `eval` blocks in spec.yaml are silently ignored by the parser. No manual action needed — they become dead weight that can be cleaned up at any time.

### Requirement: Promote passing evals into spec
**Reason**: Promotion (`promotePassingEvals`) existed to freeze LLM-invented eval cases back into the spec's eval blocks for deterministic regen. With eval blocks removed from the spec, there is nothing to promote into. The generated `.eval.ts` file, committed to git, is the durable artifact.
**Migration**: Remove `src/spec/promote.ts`. Remove promote calls from the authoring loop.
