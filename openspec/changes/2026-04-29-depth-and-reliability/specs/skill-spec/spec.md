## ADDED Requirements

### Requirement: Reference Metadata

`spec.yaml` SHALL accept optional reference metadata for durable supporting
Markdown files.

#### Scenario: Valid reference entry
- **WHEN** a spec includes a reference entry
- **THEN** the entry contains `path`, `title`, `load_when`, `purpose`, and
  non-empty `topics`
- **AND** `path` matches `references/<slug>.md` with no nested directories

#### Scenario: Duplicate reference path
- **WHEN** a spec includes two reference entries with the same `path`
- **THEN** structural validation fails before generation
