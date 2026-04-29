## MODIFIED Requirements

### Requirement: create command tool defaults

`skillet create` SHALL populate `frontmatter_extras: { "allowed-tools": "<list>" }` on the new spec by default, so the generated SKILL.md ships with a working `allowed-tools` line. The default list SHALL be `Read Grep Glob Bash Edit Write` — a permissive Claude Code subset that covers most authoring workflows without including destructive or network-bound tools. Users SHALL be able to override via `--tools "<custom list>"` or opt out entirely via `--no-default-tools`.

#### Scenario: Default tools land in frontmatter
- **WHEN** `skillet create "my new skill"` runs to completion
- **THEN** the generated SKILL.md frontmatter includes `allowed-tools: Read Grep Glob Bash Edit Write`

#### Scenario: --tools overrides the default
- **WHEN** `skillet create "my skill" --tools "Read Grep"` runs
- **THEN** the generated SKILL.md frontmatter includes `allowed-tools: Read Grep` and not the default list

#### Scenario: --no-default-tools omits the field entirely
- **WHEN** `skillet create "my skill" --no-default-tools` runs
- **THEN** the generated SKILL.md frontmatter contains no `allowed-tools` line and `frontmatter_extras` does not include the key

## ADDED Requirements

### Requirement: --verbose flag and SKILLET_VERBOSE env var

Skillet's mutating commands (`create`, `improve`, `add-eval`, `spec import`, `spec refine`, `eval`, `compare`) SHALL accept a `--verbose` flag that increases log detail. The `SKILLET_VERBOSE=1` environment variable SHALL have the same effect. Verbose output SHALL include phase timing, per-behavior eval-gen progress, raw LLM input + output for every call, and staging directory paths during transactional operations.

#### Scenario: --verbose enables detailed logs
- **WHEN** `skillet improve ./my-skill --verbose` runs
- **THEN** stderr contains per-phase timing, per-behavior eval-gen lines, and the raw prompts and responses for every LLM call

#### Scenario: SKILLET_VERBOSE env var has the same effect
- **WHEN** `SKILLET_VERBOSE=1 skillet improve ./my-skill` runs
- **THEN** verbose logging is active even without the flag

### Requirement: SKILLET_EVAL_GEN_MODEL override

Skillet SHALL accept `SKILLET_EVAL_GEN_MODEL=<provider/model-id>` to override the model used for per-behavior eval generation. When unset, eval-gen uses the LLM judge model.

#### Scenario: Default is the judge model
- **WHEN** `SKILLET_EVAL_GEN_MODEL` is unset and the judge model is `anthropic/claude-haiku-4-5`
- **THEN** eval-gen calls use claude-haiku-4-5

#### Scenario: Override applies
- **WHEN** `SKILLET_EVAL_GEN_MODEL=openai/gpt-4o-mini` is set
- **THEN** eval-gen calls use gpt-4o-mini regardless of agent and judge model settings
