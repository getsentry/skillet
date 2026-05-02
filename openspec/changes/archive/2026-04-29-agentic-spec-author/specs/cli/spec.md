## ADDED Requirements

### Requirement: Research Input Flag

`skillet create`, `skillet spec init`, and `skillet spec import` SHALL
accept a repeatable `--input <path>` flag. Each path SHALL be resolved to
an absolute directory and added to the spec-author research scope. Paths
that do not exist SHALL cause the command to exit non-zero before any
LLM call.

#### Scenario: Single input path
- **WHEN** `skillet create "..." --input ./repo` is run
- **THEN** the spec-author loop's research scope includes the absolute
  path of `./repo`

#### Scenario: Multiple input paths
- **WHEN** `skillet create "..." --input ./repo --input ./docs` is run
- **THEN** the research scope includes both absolute paths

#### Scenario: Missing input path
- **WHEN** `skillet create "..." --input ./does-not-exist` is run
- **THEN** the command exits non-zero with an error naming the missing
  path and does not invoke the LLM

### Requirement: Tool-Call Visibility in Turn Presentation

The CLI's turn presentation SHALL include a one-line summary of tool calls
made by the agent during the turn, so the user can see what was
investigated.

#### Scenario: Turn with tool calls
- **WHEN** an agent turn calls `read_file` three times and `grep` once
- **THEN** the turn presentation includes a line such as
  `tools: 3× read_file, 1× grep`

#### Scenario: Turn without tool calls
- **WHEN** an agent turn issues no tool calls
- **THEN** the turn presentation omits the tool summary line (or shows
  `tools: (none)`)
