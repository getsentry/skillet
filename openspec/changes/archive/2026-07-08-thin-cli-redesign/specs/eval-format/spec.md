# Eval Format Delta

## REMOVED Requirements

### Requirement: Eval-file layout per skill
**Reason**: The TypeScript `describeEval`/vitest format is replaced wholesale by declarative YAML cases; generated code and the `_judges.ts` convention no longer exist.
**Migration**: Agent-driven `/skillet:migrate` converts existing eval intent into `evals/cases/*.yaml`.

### Requirement: First-class assertion shapes
**Reason**: Assertions become declarative `checks` entries in YAML, not `expect(...)` code.
**Migration**: Express deterministic assertions as `file_exists`/`shell` checks; semantic assertions as `judge` checks.

### Requirement: Named judge factory and toSatisfyJudge matcher
**Reason**: No generated TypeScript, no matchers. Judges are a check type executed through the harness.
**Migration**: Convert each named judge rubric into a `judge:` check string on the relevant case.

### Requirement: Per-test fixture API
**Reason**: `createWorkspace()` was an API for generated code. Fixtures become a declarative `fixture:` field.
**Migration**: Keep `evals/fixtures/<slug>/` directories; reference them by slug from case files.

### Requirement: Discovery and `tests_behavior` metadata
**Reason**: Discovery of `*.eval.ts` and embedded metadata is obsolete.
**Migration**: Cases live in `evals/cases/*.yaml` with a required `behavior:` field.

## ADDED Requirements

### Requirement: Declarative YAML eval cases

Eval cases SHALL be YAML files in `evals/cases/`, one case per file. A case has required fields `behavior` (a behavior identifier from spec.md) and `prompt` (the user message given to the agent under test), and optional fields `fixture` (a slug under `evals/fixtures/`), `setup` (a shell script run in the workspace before the agent), `checks` (list of check entries), `trials` (default 1), and `timeout` (seconds, default 300).

#### Scenario: Minimal case
- **WHEN** a case file contains only `behavior:` and `prompt:` plus one check
- **THEN** it is valid and runs in a fresh empty workspace

#### Scenario: Case with fixture and setup
- **WHEN** a case declares `fixture: git-repo` and a `setup:` script
- **THEN** the fixture directory is copied into the workspace and the setup script runs there before the agent starts

### Requirement: Check types

The supported check types SHALL be: `file_exists: <path>` (path exists in the workspace after the run), `shell: <command>` (command run in the workspace; exit 0 passes), and `judge: <criterion>` (natural-language criterion graded through the harness). Checks against the raw transcript text via regex or substring are deliberately not supported.

#### Scenario: Shell check passes
- **WHEN** a case has `shell: "git log -1 --format=%s | grep -q '^feat:'"` and the agent produced such a commit
- **THEN** the check passes

#### Scenario: Deterministic checks run before judges
- **WHEN** a case has both shell checks and a judge check
- **THEN** shell and file checks run first, and the judge is invoked only if they all pass

### Requirement: Human-authorable and durable

Eval cases SHALL be plain data that humans can write and edit directly. Skillet SHALL never regenerate or overwrite existing case files; agents add cases guided by `skillet instructions evals`.

#### Scenario: Hand edits stick
- **WHEN** a user edits a case's prompt and re-runs any skillet command
- **THEN** the edited file is untouched by skillet
