# Structured Output Delta

Capability removed as a standalone spec: `--json` becomes a cross-cutting CLI convention (see the cli capability's "JSON output convention" requirement) rather than a vitest-evals-shaped contract.

## REMOVED Requirements

### Requirement: JSON output mode for eval
**Reason**: Respecified under the cli capability without vitest-evals type coupling.
**Migration**: Consumers read the new eval result shape (cases grouped by behavior, checks with pass/fail, transcripts, trial pass rates).

### Requirement: Normalized result shape
**Reason**: `NormalizedSession`/`UsageSummary`/`HarnessRun` types leave with the vitest-evals dependency.
**Migration**: The new shape carries `transcript`, `checks`, `trials`, and optional `baseline` per case.

### Requirement: JSON output for validate
**Reason**: Respecified under the cli capability's JSON output convention.
**Migration**: None.
