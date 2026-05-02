## ADDED Requirements

### Requirement: Agentic Spec-Author Loop

The spec-author loop SHALL run the LLM as a tool-using agent each turn.
The agent SHALL have read-only filesystem tools scoped to a research
scope and SHALL emit the structured turn output (`patches`, `questions`,
`commit_request`) only after concluding any investigation.

#### Scenario: Agent reads inputs before proposing
- **WHEN** the user runs `skillet create "<description>" --input ./repo`
- **THEN** the spec-author loop's first turn allows the agent to call
  `read_file`, `list_files`, and `grep` against `./repo` and the bundled
  references before emitting patches
- **AND** the agent's terminal text per turn is parsed as the same
  `{ patches, questions, commit_request }` JSON

#### Scenario: Agent has no write tools
- **WHEN** the spec-author loop runs
- **THEN** the agent's tool list does not include `bash`, `write_file`, or
  `edit_file`
- **AND** any direct attempt to mutate state goes through the patch
  mechanism

#### Scenario: Tool budget exceeded
- **WHEN** an agent issues more than the per-turn `maxToolCalls` (default
  30) tool calls in a single turn
- **THEN** the kernel injects a synthetic user message indicating the
  budget is exhausted and the next LLM call must produce terminal output
- **AND** if the LLM still issues a tool call after that nudge, the
  current call surfaces a clear error

### Requirement: Research Scope Enforcement

Spec-author tool calls SHALL only succeed against paths inside the
declared research scope. Paths outside the scope SHALL produce a tool
error returned to the LLM (not a process crash).

#### Scenario: In-scope read
- **WHEN** the agent calls `read_file` for a path inside an `--input`
  directory or the bundled references
- **THEN** the file contents are returned

#### Scenario: Out-of-scope read
- **WHEN** the agent calls `read_file` for `/etc/passwd` (or any path
  outside the scope)
- **THEN** the tool returns an error string indicating the path is outside
  the research scope
- **AND** no filesystem read is performed

### Requirement: Research Scope Composition

The research scope SHALL be composed from skillet's bundled `references/`,
the target skill root (when it exists), and any user-supplied
`--input <path>` flags. When no `--input` is given, the CWD SHALL be added
to the scope.

#### Scenario: Default scope
- **WHEN** `skillet create` is run without any `--input` flags
- **THEN** the scope includes the bundled references and the CWD

#### Scenario: Explicit scope
- **WHEN** `skillet create` is run with one or more `--input` flags
- **THEN** the scope includes the bundled references and each `--input`
  path
- **AND** the CWD is NOT added to the scope unless one of the inputs
  resolves to it

### Requirement: Resume Preserves Scope

Resuming a paused session SHALL use the same research scope as the
original invocation.

#### Scenario: Resume after pause
- **WHEN** a session is persisted with `inputPaths: ["./repo"]` and the
  user runs `skillet resume <skill-root> --answer "..."`
- **THEN** the resumed loop's scope is recomposed from `./repo` and the
  bundled references
- **AND** `skillet resume` does not accept `--input` flags
