## MODIFIED Requirements

### Requirement: Eval generation produces TypeScript

The eval-gen phase SHALL produce one `evals/<behavior-id>.eval.ts` file per spec behavior and must_not. Generation SHALL issue ONE LLM CALL PER BEHAVIOR (rather than a single batched call for the full set), with calls running in parallel up to a configurable concurrency cap. Each call SHALL:

- See the behavior's id, statement, and rationale.
- See the spec's complete `must_not[]` list with explicit instruction not to construct fixtures that trip those rules.
- Return a JSON array of one or more case objects whose `tests_behavior` matches the requested id.

Files for successfully generated behaviors SHALL be written immediately. A failure on any one behavior SHALL NOT abort the generation of other behaviors. The phase SHALL report which behaviors succeeded and which failed.

#### Scenario: Each behavior gets a dedicated LLM call
- **WHEN** eval-gen runs against a spec with 10 behaviors and 2 must_nots
- **THEN** the LLM is invoked 12 times (once per entry), with each call's prompt focused on a single entry

#### Scenario: Calls run in parallel
- **WHEN** eval-gen runs against a spec with 12 entries
- **THEN** up to N calls run concurrently (default 6) — wall-time scales with `ceil(entries / concurrency)`, not with `entries` directly

#### Scenario: Per-behavior failures are isolated
- **WHEN** eval-gen succeeds for behaviors A, B, C and fails for D
- **THEN** files for A, B, and C are written; D produces an error in the failure report; the user can re-run to retry only D (the durability rule preserves A/B/C)

#### Scenario: must_not list is included in every call
- **GIVEN** a privacy skill with must_not entries about handling fictional company names
- **WHEN** eval-gen generates a positive fixture for an unrelated behavior
- **THEN** the prompt includes the full must_not list with instruction not to build fixtures that trigger them
- **AND** the LLM avoids inputs that would cross those rules (e.g. doesn't use names matching the rule's pattern)

### Requirement: Generation can use a cheaper model

Eval generation SHALL use the model resolved as `evalGen` (or fall back to the judge model if unconfigured). Users SHALL be able to override via `SKILLET_EVAL_GEN_MODEL=<provider/model>`.

#### Scenario: Defaults to the judge model
- **WHEN** `SKILLET_EVAL_GEN_MODEL` is not set
- **THEN** eval-gen uses the same model as the LLM judge (typically a fast/cheap model like Haiku)

#### Scenario: Override works
- **WHEN** the user sets `SKILLET_EVAL_GEN_MODEL=anthropic/claude-haiku-4-5`
- **THEN** eval-gen uses that model regardless of the agent and judge model settings

### Requirement: Skill generation renders extra frontmatter

skill-gen SHALL render any `frontmatter_extras` keys from the spec into the generated SKILL.md frontmatter on every regen. Values pass through unchanged (strings stay strings, lists stay lists). When the spec has no extras, only the standard `name` and `description` fields are rendered.

#### Scenario: allowed-tools survives regen
- **GIVEN** a spec with `frontmatter_extras: { "allowed-tools": "Read Grep Glob Bash" }`
- **WHEN** skill-gen renders SKILL.md
- **THEN** the output frontmatter contains `allowed-tools: Read Grep Glob Bash`

#### Scenario: Multi-key extras pass through
- **GIVEN** a spec with `frontmatter_extras: { "allowed-tools": "Read", "argument-hint": "<file>" }`
- **WHEN** skill-gen renders SKILL.md
- **THEN** both keys appear in the frontmatter; key order is stable across runs

### Requirement: spec-import preserves unknown frontmatter

The spec-import phase SHALL capture every frontmatter key in the source SKILL.md that is not `name` or `description` into the spec's `frontmatter_extras` field. Captured values SHALL be passed through unchanged. The capture SHALL NOT fail when a value's type is unexpected — values are stored opaquely and rendered back on regen.

#### Scenario: allowed-tools is captured on import
- **GIVEN** a SKILL.md with frontmatter `allowed-tools: Read Grep Glob Bash`
- **WHEN** `skillet spec import` runs
- **THEN** the resulting spec.yaml contains `frontmatter_extras: { "allowed-tools": "Read Grep Glob Bash" }`

#### Scenario: Multiple unknown keys are captured
- **GIVEN** a SKILL.md with frontmatter containing `allowed-tools`, `argument-hint`, `model`
- **WHEN** spec-import runs
- **THEN** all three keys appear under `frontmatter_extras` in the spec

## ADDED Requirements

### Requirement: Verbose phase logging

When `SKILLET_VERBOSE=1` (or `--verbose` is passed to a command), the authoring loop, spec import, regen, and eval-gen phases SHALL emit structured log events to stderr including:

- Phase start with timestamp.
- Phase end with elapsed milliseconds and success/failure status.
- Per-behavior eval-gen progress (`eval-gen behavior=<id> attempt=<n> ok=<bool>`).
- On any LLM response that fails to parse or validate: a short message plus the first 200 characters of the raw response.
- Full LLM input + output for every call when verbose mode is on.

Default (non-verbose) runs SHALL still emit phase boundaries with timing and per-behavior eval-gen progress at minimum.

#### Scenario: Default logs show per-behavior progress
- **WHEN** eval-gen runs without `--verbose`
- **THEN** stderr shows one line per behavior with the behavior id and pass/fail status

#### Scenario: Verbose logs include LLM I/O
- **WHEN** eval-gen runs with `--verbose`
- **THEN** stderr includes the full prompt sent to the LLM and the full response received for each behavior

#### Scenario: Failure context is logged at default verbosity
- **GIVEN** an eval-gen call returns malformed JSON
- **WHEN** the validator rejects it
- **THEN** stderr shows the validation error AND the first 200 chars of the LLM response, regardless of verbosity
