## MODIFIED Requirements

### Requirement: Judge results in normalized format

Judge results SHALL fold into the normalized eval result structure. The judge output (grade, score, reasoning) SHALL appear under the `judge` field of each case result, alongside `session`, `usage`, `checks`, and `errors`.

#### Scenario: Judge result in JSON output
- **WHEN** `skillkit eval --json` runs a case with criteria
- **THEN** the case result `judge` field contains `{ grade, score, reasoning }`

#### Scenario: Judge invocation logic unchanged
- **WHEN** an eval case has `criteria` and all structural `checks` pass
- **THEN** the LLM judge is invoked with the same A-E rubric as v1
