## REMOVED Requirements

### Requirement: SKILL.md structural validation

**Reason**: Folded into the `spec-verification` capability as layer 1 of the unified `skillet verify` command.

**Migration**: SKILL.md frontmatter and required-field checks now run as part of `verify`'s structural layer. Behavior is preserved; only the surface command changes from `skillet validate` to `skillet verify`.

### Requirement: Eval file structural validation

**Reason**: Folded into `spec-verification` as part of layer 1 (per-file structural lint).

**Migration**: Eval YAML parse + required-field checks now run inside `verify`. The eval parser additionally accepts a `tests_behavior` field, but unknown values are not a structural error — they're checked in `verify`'s cross-artifact layer.

### Requirement: No LLM calls in validation

**Reason**: Replaced by the same contract on `verify`'s default mode — layers 1–3 make no LLM calls. Layer 4 (semantic) is opt-in via `--semantic`.

**Migration**: Users who relied on `skillet validate` for offline structural checks should run `skillet verify` (without `--semantic`); behavior is equivalent.
