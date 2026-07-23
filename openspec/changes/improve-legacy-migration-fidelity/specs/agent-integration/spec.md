# Agent Integration Delta

## ADDED Requirements

### Requirement: Behavior-preserving migration guidance

The instructions returned by `skillet instructions spec` SHALL direct agents migrating an existing skill to inventory behavior-bearing material from the legacy runtime skill, legacy specs, references, and nearby maintenance docs before drafting `spec.md`. The inventory SHALL include triggers, ordered workflow, exact enumerations, protocols and output formats, numeric thresholds, failure and stopping rules, constraints, and runtime references. Each item SHALL be represented in the new behavior contract or explicitly retained, relocated, superseded, or rejected.

The instructions returned by `skillet instructions skill` SHALL distinguish concise rewriting from behavior loss. Exact runtime formats, thresholds, enumerations, and delegation or output protocols SHALL be preserved in `SKILL.md` or a linked runtime reference, and the agent SHALL reconcile removed legacy rules before completing the render.

#### Scenario: Migrate a skill with exact reviewer protocols

- **GIVEN** an existing skill has a legacy `SKILL.md` with an enumerated review taxonomy, a three-agent concurrency limit, structured finding output, numeric loop stops, and long reviewer prompt templates
- **WHEN** an agent follows the CLI-served spec and skill instructions to migrate it
- **THEN** those operational contracts appear in `spec.md` and the rendered runtime surfaces, with long templates optionally moved to a linked reference rather than silently dropped

#### Scenario: Remove obsolete maintenance prose

- **GIVEN** a legacy maintenance document contains historical or stale prose that is not part of the accepted runtime contract
- **WHEN** the agent performs the migration reconciliation
- **THEN** it may omit or update that prose while preserving the runtime behavior and explicitly accounting for the intentional change
