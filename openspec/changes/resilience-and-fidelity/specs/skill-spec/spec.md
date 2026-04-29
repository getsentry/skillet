## ADDED Requirements

### Requirement: frontmatter_extras for round-trip preservation

The `SkillSpec` schema SHALL include an optional `frontmatter_extras` field of type `Record<string, unknown>`. The field captures arbitrary SKILL.md frontmatter keys that are not part of skillet's typed schema (currently `name` and `description`). The parser SHALL accept any value type for keys under `frontmatter_extras`. The IO layer SHALL preserve the field across read → write round trips.

#### Scenario: Spec parses with frontmatter_extras
- **GIVEN** a spec.yaml containing `frontmatter_extras: { "allowed-tools": "Read Grep" }`
- **WHEN** the spec is read
- **THEN** `spec.frontmatter_extras` is `{ "allowed-tools": "Read Grep" }`

#### Scenario: Spec without frontmatter_extras is valid
- **GIVEN** a spec.yaml that omits `frontmatter_extras`
- **WHEN** the spec is read
- **THEN** `spec.frontmatter_extras` is undefined or empty; structural validation passes

#### Scenario: Round trip preserves extras
- **GIVEN** a spec read from disk with `frontmatter_extras` populated
- **WHEN** the spec is written back via writeSpec
- **THEN** the on-disk file contains the same extras with the same values

#### Scenario: Heterogeneous value types pass through
- **GIVEN** a spec with `frontmatter_extras: { "allowed-tools": "Read Grep", "max-turns": 5 }`
- **WHEN** the spec is read and written back
- **THEN** values retain their original types (string and number respectively)

#### Scenario: Reserved keys produce a validation warning
- **GIVEN** a spec where `frontmatter_extras` contains the key `name` (skillet's typed field)
- **WHEN** the spec is validated
- **THEN** validation emits a warning naming the conflict but the spec is still considered valid (the typed `name` field takes precedence on render)
