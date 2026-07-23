# Skill Spec Delta

## ADDED Requirements

### Requirement: Spec version fingerprint

Newly scaffolded or newly authored `spec.md` files SHALL end with a standalone `<!-- skillet-version: <version> -->` footer populated from the running Skillet package version. The footer SHALL NOT alter the parsed semantic spec representation, and a missing footer in an existing spec SHALL NOT make that spec invalid.

#### Scenario: New scaffold records provenance

- **WHEN** `skillet new` creates a spec using Skillet version `1.4.1`
- **THEN** the final non-empty line is `<!-- skillet-version: 1.4.1 -->`

#### Scenario: Parser reads a fingerprinted spec

- **WHEN** a valid spec ends with a Skillet version footer
- **THEN** parsing returns the same intent, triggers, behaviors, scenarios, and constraints as the same spec without the footer

#### Scenario: Existing spec has no footer

- **WHEN** an existing otherwise-valid spec has no version footer
- **THEN** validation still accepts it
