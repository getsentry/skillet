## ADDED Requirements

### Requirement: Large Semantic Verification

Semantic verification SHALL work on large specs by judging bounded batches of
rules instead of requiring a single JSON response for every behavior and
must-not.

#### Scenario: Large spec semantic check
- **WHEN** `skillet verify --semantic` runs against a spec with dozens of
  behaviors
- **THEN** the semantic judge is called in batches
- **AND** malformed JSON in one batch does not invalidate unrelated batches

#### Scenario: Fenced or noisy judge output
- **WHEN** the semantic judge returns a fenced JSON array or surrounding prose
- **THEN** Skillet extracts and parses the JSON array before deciding the batch
  failed
