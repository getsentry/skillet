# Eval Linter Delta

Capability removed: the linter existed to sanitize LLM-generated eval YAML/TypeScript (Python-regex rewriting, auto-fix pipeline). The new declarative case schema is small enough that plain schema validation (validation capability) covers it, and regex checks no longer exist at all.

## REMOVED Requirements

### Requirement: Regex syntax validation
**Reason**: Regex/substring checks are not part of the new eval format.
**Migration**: Express matching as `shell` checks (grep in the workspace) or `judge` criteria.

### Requirement: Structure validation
**Reason**: Subsumed by the case-schema validation in the validation capability.
**Migration**: None.

### Requirement: Timeout validation
**Reason**: Subsumed by case-schema validation (`timeout` must be a positive number).
**Migration**: None.

### Requirement: Threshold validation
**Reason**: Thresholds no longer exist; judges return binary verdicts.
**Migration**: Remove `threshold` fields during migration.

### Requirement: YAML parse safety
**Reason**: Subsumed by case-schema validation's parse-error reporting.
**Migration**: None.

### Requirement: Auto-fix pipeline
**Reason**: With no generated code to repair, auto-fixing is unnecessary; validation errors carry fix hints instead.
**Migration**: None.
