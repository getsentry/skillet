## ADDED Requirements

### Requirement: Staged writes for skill-mutating commands

Commands that produce or rewrite SKILL.md, spec.yaml, or eval files (`create`, `improve`, `add-eval`, `spec import`, `spec refine`) SHALL write all derived files to a sibling staging directory before swapping them into the live skill directory. On any failure during the run, the staging directory SHALL be removed and the live skill directory SHALL remain unchanged.

#### Scenario: Successful import swaps cleanly
- **WHEN** `skillet spec import` runs to completion against a legacy skill
- **THEN** spec.yaml, SKILL.md, and `evals/<id>.eval.ts` files are written to a staging directory, then atomically renamed into the skill root once all generation succeeds

#### Scenario: Failure during eval-gen leaves the original skill intact
- **GIVEN** a legacy skill with SKILL.md and no spec.yaml
- **WHEN** `skillet spec import` runs spec-init successfully but eval-gen fails on the third behavior
- **THEN** the live skill directory contains its original SKILL.md unchanged, no spec.yaml, no eval files
- **AND** the staging directory is removed

#### Scenario: Files outside the staging plan are not touched
- **GIVEN** a skill directory containing `SKILL.md`, `references/foo.md`, and `evals/legacy.eval.ts`
- **WHEN** a command writes only spec.yaml and a new eval file
- **THEN** `references/foo.md` and `evals/legacy.eval.ts` are unchanged whether the command succeeds or fails

#### Scenario: Per-file rename is atomic
- **WHEN** the swap step renames staged files into place
- **THEN** each file is moved with a single rename() syscall, so a partial swap leaves either the old file or the new file at any given path (never an empty or half-written file)

### Requirement: Verbose mode surfaces staging paths

When `--verbose` (or `SKILLET_VERBOSE=1`) is set, the staging directory path SHALL be logged at creation, on swap, and on cleanup so the user can inspect what was about to be written when investigating failures.

#### Scenario: Verbose log includes staging path
- **WHEN** a transactional command runs with `--verbose`
- **THEN** stderr contains a log line naming the staging directory used for the run
