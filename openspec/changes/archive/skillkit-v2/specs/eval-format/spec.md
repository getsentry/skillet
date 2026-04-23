## MODIFIED Requirements

### Requirement: Eval result types

Eval case results SHALL use a normalized shape compatible with vitest-evals. Each result SHALL include `session` (with `messages` array), `usage` (with tool call count and optional token/provider metadata), structured `checks`, optional `judge` result, and an `errors` array. The `CaseResult` type replaces the previous flat structure.

#### Scenario: Result includes session transcript
- **WHEN** an eval case completes (pass, fail, or error)
- **THEN** the result `session.messages` contains the full conversation transcript as `{ role, content }` objects

#### Scenario: Result includes usage metadata
- **WHEN** an eval case completes
- **THEN** `usage.toolCalls` reflects the number of tool calls made, and `usage.provider` and `usage.model` reflect the LLM used

#### Scenario: JSON serialization roundtrips
- **WHEN** a result is serialized to JSON and deserialized
- **THEN** all fields are preserved without data loss

### Requirement: Eval YAML case definition

The YAML eval format (top-level `evals` array with `name`, `turns`, `checks`, `criteria`, `threshold`, `timeout`, `requires`, `workspace`) SHALL remain unchanged. YAML stays as the authoring format for eval cases.

#### Scenario: Existing eval files still work
- **WHEN** eval YAML files from v1 are run with v2
- **THEN** they execute identically; only the result reporting format changes
