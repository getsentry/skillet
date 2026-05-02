# Eval Format — Tighter Renderer Caps

## MODIFIED Requirements

### Requirement: Renderer rejects judge-only cases

The renderer SHALL reject any plan in which a case's assertion list
contains only `judge` kinds with no deterministic checks. Each case
that uses a judge SHALL also include at least two deterministic
assertions (any combination of `output-matches`, `output-contains`,
`output-not-contains`, `output-match-object`, `tool-calls`).

#### Scenario: Judge-only case rejected
- **GIVEN** a plan whose case `foo__only-judge` has
  `assertions: [{ kind: "judge", judgeName: "FooJudge" }]`
- **WHEN** `renderEvalFile` is called
- **THEN** it throws `RenderError` naming the case and explaining
  the deterministic-minimum rule

### Requirement: Renderer caps judge criteria at 300 characters

The renderer SHALL reject plans whose any `judge.criterion`
exceeds 300 characters. (The generator targets 200; the renderer's
slack of 300 absorbs minor overruns without blocking output.)

#### Scenario: Long criterion rejected
- **GIVEN** a plan whose `judges[0].criterion` is 450 characters
- **WHEN** `renderEvalFile` is called
- **THEN** it throws `RenderError` with a message naming the judge
  and the actual character count

### Requirement: Renderer rejects single-common-English-word patterns

The renderer SHALL reject `output-matches` patterns and
`output-contains`/`output-not-contains` values that are a single
common English word with no domain qualifier. The banned base set
includes (at minimum): `vulnerable`, `unsafe`, `dangerous`, `risk`,
`issue`, `problem`, `bug`, `wrong`, `bad`, `broken`. A pattern
combining a banned word with another anchor (e.g. `\\bunsafe\\s+yaml\\.load\\b`)
is permitted.

#### Scenario: Bare /vulnerable/i rejected
- **WHEN** an `output-matches` assertion uses pattern
  `vulnerable` with no other anchors
- **THEN** the renderer throws `RenderError` advising to combine
  with a domain-specific token (function name, fixture filename,
  CVE id, etc.)

#### Scenario: Anchored pattern accepted
- **WHEN** an `output-matches` pattern is
  `\\b(unsafe|dangerous)\\s+(deserialization|yaml\\.load)\\b`
- **THEN** the renderer accepts it (the bare word is anchored to
  a domain term)

### Requirement: Renderer rejects more than one judge per file

The renderer SHALL reject plans whose `judges` array has more than
one entry. One named judge per behavior is the contract; multiple
judges in a single file fragments grading and contradicts the
"one judge per behavior" prompt rule.

#### Scenario: Two judges rejected
- **GIVEN** a plan with `judges: [JudgeA, JudgeB]`
- **WHEN** `renderEvalFile` is called
- **THEN** it throws `RenderError` listing both names and pointing
  the user at the one-judge-per-file rule

### Requirement: Renderer rejects unreferenced judges

The renderer SHALL reject plans whose `plan.judges` includes a
declaration that no case's assertions reference. Dead declarations
are renderer waste and indicate either a generator mistake or a
verifier edit that didn't fully clean up.

#### Scenario: Declared but unreferenced judge rejected
- **GIVEN** a plan with `judges: [{ name: "GhostJudge", ... }]`
  and no case containing `{ kind: "judge", judgeName: "GhostJudge" }`
- **WHEN** `renderEvalFile` is called
- **THEN** it throws `RenderError` naming `GhostJudge` and
  recommending it be removed or referenced
