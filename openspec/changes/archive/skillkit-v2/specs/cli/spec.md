## MODIFIED Requirements

### Requirement: CLI command surface

The CLI SHALL support the following commands: `create`, `improve`, `eval`, `validate`. The `iterate` command is removed. The `create` and `improve` commands are agentic (LLM-driven). The `eval` and `validate` commands are mechanical.

#### Scenario: Create command
- **WHEN** `skillkit create "description of skill"` is run
- **THEN** the system creates a new skill directory with SKILL.md, generates evals, runs them, and iterates

#### Scenario: Create with explicit path
- **WHEN** `skillkit create "description" --path ./my-skill` is run
- **THEN** the skill is created at the specified path

#### Scenario: Create fails if SKILL.md exists
- **WHEN** `skillkit create` targets a directory that already contains SKILL.md
- **THEN** the command exits with an error suggesting `skillkit improve` instead

#### Scenario: Improve command
- **WHEN** `skillkit improve [path]` is run in a directory with SKILL.md
- **THEN** the system reads the existing skill, generates/adds evals, optionally refines the skill, and iterates

#### Scenario: Improve fails if no SKILL.md
- **WHEN** `skillkit improve` targets a directory with no SKILL.md
- **THEN** the command exits with an error suggesting `skillkit create` instead

#### Scenario: Eval command with JSON
- **WHEN** `skillkit eval [path] --json` is run
- **THEN** structured JSON results are written to stdout

#### Scenario: Validate command
- **WHEN** `skillkit validate [path]` is run
- **THEN** structural validation runs and reports errors (if any) with exit code 0 for valid, 1 for invalid

#### Scenario: Help text
- **WHEN** `skillkit --help` is run
- **THEN** all four commands are listed with brief descriptions

## REMOVED Requirements

### Requirement: Iterate command
**Reason**: Iteration is now internal to `create` and `improve` commands, not a standalone command.
**Migration**: Use `skillkit create` or `skillkit improve` which include built-in iteration.
