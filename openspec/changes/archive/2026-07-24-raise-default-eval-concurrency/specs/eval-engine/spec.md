# Eval Engine Delta

## MODIFIED Requirements

### Requirement: Bounded trial parallelism

The eval engine SHALL keep generated case files ordered and run tests within each case with a default concurrency of four. Repeated trials and skill/baseline variants MAY execute in parallel up to the configured limit. `--concurrency` SHALL override `.skillet.yaml`, which SHALL override the default. Concurrency SHALL accept integers from one through eight.

#### Scenario: Four repeated trials

- **WHEN** one case runs four trials with default settings
- **THEN** the engine may execute those trials concurrently in separate fresh workspaces

#### Scenario: One case with baseline

- **WHEN** one case runs with `--baseline`
- **THEN** its skill and baseline variants may execute concurrently up to the configured limit

#### Scenario: Serial configuration

- **WHEN** concurrency is configured as one
- **THEN** trials and skill/baseline variants execute serially within each case
