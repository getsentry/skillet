# Agent Integration Delta

## ADDED Requirements

### Requirement: Honest eval check guidance

The instructions returned by `skillet instructions evals` SHALL distinguish direct deterministic proof from textual or structural proxies. They SHALL prefer executable verification and exact workspace state, warn that deterministic failures skip judge checks, reject string presence as evidence of semantic correctness unless the text itself is required, and permit judge-only cases when no direct deterministic proof exists.

#### Scenario: Semantic architecture requirement

- **WHEN** an agent writes an eval for an architectural requirement that admits multiple valid implementations
- **THEN** the instructions direct it to use a semantic judge rather than grep for likely API names or constructors

#### Scenario: Directly executable requirement

- **WHEN** an agent writes an eval for behavior that can be proven by tests, produced code, typechecking, a build, or exact filesystem or git state
- **THEN** the instructions direct it to use that deterministic evidence before adding a judge

#### Scenario: No deterministic proof available

- **WHEN** a requirement is semantic and has no direct deterministic proof
- **THEN** the instructions allow a judge-only case instead of requiring weak shell checks
