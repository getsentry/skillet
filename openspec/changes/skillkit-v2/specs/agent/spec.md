## MODIFIED Requirements

### Requirement: Dual-role agent runtime

The agent runtime SHALL serve two roles: executing eval cases (existing behavior) and driving skill authoring/improvement phases. Both roles use the same underlying LLM call mechanism (pi-ai `complete()`) and tool surface, but with different system prompts and contexts.

#### Scenario: Eval execution mode
- **WHEN** the agent runs an eval case
- **THEN** the system prompt contains the SKILL.md body and workspace context, and tools are scoped to the eval workspace directory

#### Scenario: Authoring mode
- **WHEN** the agent runs a skill authoring phase
- **THEN** the system prompt contains phase-specific instructions and skill-writer reference material, and tools are scoped to the skill directory

### Requirement: Agent tool surface unchanged

The eval agent tool surface (bash, read_file, write_file, edit_file, list_files, grep) SHALL remain unchanged. The authoring agent MAY use the same tools scoped to the skill directory.

#### Scenario: Eval tools unchanged
- **WHEN** an eval case runs
- **THEN** the same six tools (bash, read_file, write_file, edit_file, list_files, grep) are available as in v1
