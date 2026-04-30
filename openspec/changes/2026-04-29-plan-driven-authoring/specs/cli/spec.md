## ADDED Requirements

### Requirement: TTY-Aware Spec-Author Transport

The CLI SHALL provide a TTY-aware question/answer transport for the
spec-author loop. In TTY mode it SHALL read answers from stdin via blocking
readline. In non-TTY mode it SHALL pause the loop, persist a session file
under the skill root, and exit non-zero with the open questions printed.

#### Scenario: TTY interactive run
- **WHEN** the spec-author loop returns open questions and stdin is a TTY
- **THEN** each question is rendered to the user and an answer is read via
  blocking readline before the next loop turn

#### Scenario: Non-TTY pause
- **WHEN** the spec-author loop returns open questions and stdin is not a TTY
- **THEN** the CLI persists `<skillRoot>/.skillet-session.json` containing
  the spec, full LLM message history, pending questions, and seed metadata
- **AND** the CLI prints the questions to stderr along with a `skillet resume`
  hint and exits with status code 2
- **AND** no SKILL.md or eval files are generated until the session is resumed
  and accepted

### Requirement: Resume Command

The CLI SHALL provide a `skillet resume <path> --answer "..."` command that
hydrates a persisted session, pre-feeds answers to the author loop, and
continues from the pause point.

#### Scenario: Resume with matching answer count
- **WHEN** the user runs `skillet resume <path> --answer "..."` with one
  `--answer` flag per pending question
- **THEN** the answers are pre-fed to the author loop in order
- **AND** if the loop terminates with user acceptance, the session file is
  deleted and SKILL.md / evals are generated
- **AND** if the loop pauses again, the session file is rewritten with the
  new pending questions

#### Scenario: Resume with mismatched answer count
- **WHEN** the number of `--answer` flags does not match
  `pendingQuestions.length` in the session
- **THEN** the CLI prints all pending questions and exits non-zero without
  invoking the LLM

### Requirement: Refuse Conflicting Start

`skillet create` and `skillet spec init`/`spec import` SHALL refuse to start
when a paused session file exists at the target skill root.

#### Scenario: Session present at create
- **WHEN** `skillet create` is run against a directory containing
  `.skillet-session.json`
- **THEN** the CLI exits non-zero with a message pointing the user at
  `skillet resume` (or to delete the session file)
