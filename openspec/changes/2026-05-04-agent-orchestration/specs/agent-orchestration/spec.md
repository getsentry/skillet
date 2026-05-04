## ADDED Requirements

### Requirement: Bundled Agents Layout

Skillet SHALL ship four bundled Anthropic Agent Skills under an
`agents/` directory in the npm package: `skill-writer`,
`eval-writer`, `skill-validator`, and `evals-validator`. Each
agent directory SHALL conform to the Agent Skills format —
`SKILL.md` with frontmatter (`name`, `description`) plus an
optional `references/` subdirectory of routed leaf files.

#### Scenario: Agent skills load from the package
- **WHEN** the orchestrator resolves an agent by name
- **THEN** it finds the agent's `SKILL.md` under
  `<package-root>/agents/<name>/SKILL.md` and the agent's
  reference files under `<package-root>/agents/<name>/references/`
- **AND** all four bundled agents resolve without network access

#### Scenario: Agent description matches its role
- **WHEN** any bundled agent's `SKILL.md` is loaded
- **THEN** its frontmatter `description` describes the agent's
  authoring role in third person and lists the inputs it reads
  and the outputs it writes (or, for validators, that it emits
  diagnostics)

### Requirement: Single Agent Runner Primitive

The system SHALL expose one runner primitive,
`runAgent(agent, ctx)`, that drives any bundled agent through
`pi-agent-core`'s `runAgentLoop`. The primitive SHALL build the
system prompt from the agent's bundled SKILL.md body plus an
"Operating context" footer derived from `ctx`, configure the
tool surface from the agent's policy filtered/scoped to
`ctx.readScope` and `ctx.writeScope`, and return both the
agent's terminal text and a tool-call count.

#### Scenario: Validator writes are rejected
- **WHEN** a validator agent attempts a `write_file` or
  `edit_file` call
- **THEN** the runner rejects the call with an error message
  the agent can read on its next turn
- **AND** no file mutation occurs on disk

#### Scenario: Out-of-scope path access fails
- **WHEN** any agent attempts a `read_file` or `write_file` for a
  path not within `ctx.readScope` (for reads) or
  `ctx.writeScope` (for writes)
- **THEN** the runner returns a tool error to the agent rather
  than crashing the process

#### Scenario: Operating context appended to prompt
- **WHEN** the runner builds the system prompt
- **THEN** the agent's bundled `SKILL.md` body appears first,
  followed by an Operating Context footer that names the skill
  root path, the read scope, the write scope, and any
  `extraContext` string
- **AND** the agent's bundled reference files are reachable via
  the same `read_file`/`list_files` tools, mirroring how
  Anthropic Agent Skills load references at runtime

### Requirement: Diagnostic Schema

Validator agents SHALL emit their findings as a single JSON
object in their final assistant message. The orchestrator SHALL
extract the LAST fenced JSON block from the agent's terminal
text. The JSON SHALL conform to a fixed schema with `ok:
boolean` and a `findings: Finding[]` array, where each finding
records `severity` (`error` | `warning` | `info`), `subject`,
`kind`, `message`, and an optional `suggestion`.

#### Scenario: Well-formed clean diagnostic
- **WHEN** a validator finds no issues
- **THEN** its terminal text contains a JSON block with
  `{ "ok": true, "findings": [] }`
- **AND** the orchestrator does not trigger a writer re-pass

#### Scenario: Findings drive a re-pass
- **WHEN** a validator returns `ok: false` with at least one
  `severity: "error"` finding
- **THEN** the orchestrator re-runs the corresponding writer
  agent exactly once with the diagnostics JSON appended as
  `extraContext`
- **AND** re-runs the validator after the writer's re-pass

#### Scenario: Warnings only do not re-pass
- **WHEN** a validator returns `ok: false` with no
  `severity: "error"` findings (only warnings or info)
- **THEN** the orchestrator records the findings in the final
  report but does not trigger a writer re-pass
- **AND** the orchestrator's overall result is `success: true`

#### Scenario: Malformed diagnostic surfaces clearly
- **WHEN** a validator's terminal text does not contain a
  parseable JSON block matching the schema
- **THEN** the orchestrator surfaces a clear error including
  the offending agent name and the full terminal text
- **AND** does not silently skip the validator

### Requirement: Orchestrator Sequence

The orchestrator SHALL drive `create` and `improve` modes
through a fixed sequence: spec-author (only when spec.yaml is
absent or the user explicitly invokes the spec stage), then
writer fan-out (skill-writer + eval-writer in parallel), then
validator fan-out (skill-validator + evals-validator in
parallel), then per-pair re-pass routing, then return.

#### Scenario: Writers run in parallel
- **WHEN** the orchestrator enters writer fan-out
- **THEN** `skill-writer` and `eval-writer` start concurrently
- **AND** their LLM calls flow through `submitAiJob` so the AI
  queue throttles parallelism

#### Scenario: Validators run in parallel after writers
- **WHEN** both writers have completed their first pass
- **THEN** `skill-validator` and `evals-validator` start
  concurrently
- **AND** neither validator runs before its corresponding
  writer finishes

#### Scenario: Re-passes are independent per pair
- **WHEN** `skill-validator` returns errors but
  `evals-validator` returns clean
- **THEN** the orchestrator re-runs `skill-writer` only and
  does not re-run `eval-writer`

#### Scenario: Hard cap on re-passes
- **WHEN** a validator still returns `ok: false` after one
  re-pass of its writer
- **THEN** the orchestrator stops, records the persisting
  findings in its result, and returns `success: false`
- **AND** does not run a second re-pass without explicit
  configuration

### Requirement: Failing-Eval Context Routing

The orchestrator SHALL route failing-eval context to
`skill-writer` only. When invoked with a non-empty
`failingEvals` field, it SHALL pass the failing eval
transcripts and judge output to `skill-writer` as
`extraContext` and SHALL NOT pass `failingEvals` to
`eval-writer` — improve regenerates the SKILL.md prose against
failures, not the evals themselves.

#### Scenario: Improve loop after eval failure
- **WHEN** `skillet improve` runs after a vitest run that
  produced failing cases
- **THEN** the orchestrator runs with `failingEvals` populated
- **AND** `skill-writer`'s extraContext includes the failing
  cases, their transcripts, and any judge rationale
- **AND** `eval-writer`'s extraContext is empty

#### Scenario: Eval-writer idempotency on improve
- **WHEN** the orchestrator runs in `improve` mode and an eval
  file `evals/<id>.eval.ts` already exists for an unchanged
  spec entry
- **THEN** `eval-writer` leaves that file untouched
- **AND** `evals-validator` does not flag the unchanged file as
  drift

### Requirement: Tool Policy Per Agent

The system SHALL enforce per-agent tool policies. Writers
(`skill-writer`, `eval-writer`) MAY read and write files within
their scopes. Validators (`skill-validator`, `evals-validator`)
MAY read files within their scopes but SHALL NOT have any
write tools available. No bundled agent receives `bash`.

#### Scenario: Validator has no write tools
- **WHEN** the runner constructs the tool surface for
  `skill-validator` or `evals-validator`
- **THEN** the surface contains `read_file`, `list_files`, and
  `grep` only
- **AND** does not contain `write_file`, `edit_file`, or `bash`

#### Scenario: Writer scope confined to output paths
- **WHEN** `skill-writer` attempts to write `evals/<id>.eval.ts`
- **THEN** the runner rejects the call (out of skill-writer's
  write scope)
- **AND** the agent receives a tool error

#### Scenario: spec.yaml read-only to writers and validators
- **WHEN** any of `skill-writer`, `eval-writer`,
  `skill-validator`, or `evals-validator` attempts to write
  `spec.yaml`
- **THEN** the runner rejects the call
- **AND** the diagnostic message points the agent at the spec-
  refine command path
