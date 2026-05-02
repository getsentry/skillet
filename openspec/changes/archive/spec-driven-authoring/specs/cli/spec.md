## ADDED Requirements

### Requirement: Spec subcommand group

The CLI SHALL provide a `spec` command group with subcommands `init`, `show`, `refine`, and `import` that operate on `spec.yaml` at the skill root. `spec init` is a shortcut over the spec-init phase used by `create`: it produces a spec without entering the improve loop, useful for power users who want to inspect or edit the spec before running improvement. Every mutating subcommand (`init`, `refine`, `import`) SHALL automatically regenerate SKILL.md and eval YAMLs after writing the spec.

#### Scenario: Spec init creates spec without improve loop
- **WHEN** the user runs `skillet spec init "<description>" [--path <dir>]`
- **THEN** the system runs the spec-init phase (LLM dialogue → spec.yaml), writes the spec, and regenerates SKILL.md and eval YAMLs — but does not run evals or enter the iteration loop

#### Scenario: Spec init refuses to overwrite
- **WHEN** `skillet spec init` targets a directory that already contains `spec.yaml`
- **THEN** the command exits with an error suggesting `skillet spec refine` or manual deletion

#### Scenario: Spec show prints current spec
- **WHEN** the user runs `skillet spec show [path]`
- **THEN** the parsed `spec.yaml` is pretty-printed to stdout with banner stripped

#### Scenario: Spec refine applies natural-language feedback
- **WHEN** the user runs `skillet spec refine "<feedback>" [path]`
- **THEN** the LLM produces a `SpecPatch[]` from the feedback, the patcher applies it to `spec.yaml`, derived files are regenerated, and the path is reported

#### Scenario: Spec refine with no spec
- **WHEN** `skillet spec refine` runs against a directory without `spec.yaml`
- **THEN** the command exits with an error suggesting `skillet spec init`, `skillet create`, or `skillet spec import`

#### Scenario: Spec import reverse-engineers a spec
- **WHEN** the user runs `skillet spec import [path]` against a directory containing SKILL.md and optionally eval YAMLs
- **THEN** the system extracts behaviors and triggers from the SKILL.md prose, links existing eval cases to behavior IDs, writes `spec.yaml`, and regenerates SKILL.md and eval YAMLs from the new spec

#### Scenario: Spec import refuses to overwrite
- **WHEN** `skillet spec import` targets a directory that already contains `spec.yaml`
- **THEN** the command exits with an error and does not overwrite

### Requirement: Auto-regen on spec mutations

Every CLI operation that writes `spec.yaml` SHALL automatically regenerate SKILL.md and `evals/*.eval.yaml` after the spec write completes. There SHALL NOT be a standalone `skillet generate` command.

#### Scenario: Refine triggers regen
- **WHEN** `skillet spec refine` writes a modified `spec.yaml`
- **THEN** SKILL.md and `evals/*.eval.yaml` are regenerated before the command exits

#### Scenario: Import triggers regen
- **WHEN** `skillet spec import` writes a new `spec.yaml`
- **THEN** SKILL.md and `evals/*.eval.yaml` are regenerated before the command exits

#### Scenario: Add-eval triggers regen
- **WHEN** `skillet add-eval` appends a behavior to `spec.yaml`
- **THEN** SKILL.md and `evals/*.eval.yaml` are regenerated before the command exits

#### Scenario: Iteration loop triggers regen
- **WHEN** the iteration loop applies `SpecPatch[]` from assessment
- **THEN** SKILL.md and `evals/*.eval.yaml` are regenerated before the next iteration runs

#### Scenario: Generated files include derived banner
- **WHEN** auto-regen writes SKILL.md or eval YAMLs
- **THEN** each derived file opens with a comment banner stating it is derived from `spec.yaml` and will be overwritten on the next regeneration

### Requirement: Verify command

The CLI SHALL provide a `verify [path] [--semantic] [--json]` command that runs layered checks against the skill: per-file structural lint, cross-artifact consistency between spec / SKILL.md / evals, optional per-behavior result coverage when run results are available, and optional LLM-judged semantic coverage when `--semantic` is passed. Layers run in order and SHALL short-circuit on the first failing layer (cheaper checks fail before more expensive ones run).

#### Scenario: Structural layer (per-file lint)
- **WHEN** `skillet verify [path]` runs against a directory
- **THEN** the command first checks that `spec.yaml`, `SKILL.md`, and `evals/*.eval.yaml` each parse and have required fields; if any file fails its structural check, the command reports those errors and exits non-zero without running later layers

#### Scenario: Cross-artifact layer (default)
- **WHEN** the structural layer passes
- **THEN** the command runs `verifyCoverage` (every behavior has an eval case; no orphan `tests_behavior` references; SKILL.md `name` matches spec `name`) and reports per-behavior coverage status; exit code is 0 only when all checks pass

#### Scenario: Result layer with prior run
- **WHEN** `skillet verify` is invoked with `--with-run <path-to-trace-dir-or-json>` pointing at saved `EvalRunResult` data
- **THEN** the command additionally runs `verifyResults` and reports per-behavior pass/fail; exit code is 0 only when every behavior is `covered+passing`

#### Scenario: Semantic layer
- **WHEN** `skillet verify --semantic` runs and earlier layers pass
- **THEN** the command additionally invokes `verifySemantic` to check that SKILL.md encodes every spec behavior, prints per-behavior verdicts (`encoded` / `partial` / `missing`) with judge reasoning, and exit code is 0 only when all verdicts are `encoded`

#### Scenario: Verify with --json
- **WHEN** `skillet verify --json` runs
- **THEN** the structured report (containing structural errors, `CoverageReport`, and `ResultsReport` and `SemanticReport` when applicable) is written to stdout as a single JSON object

#### Scenario: Verify without spec
- **WHEN** `skillet verify` runs against a directory without `spec.yaml`
- **THEN** the command exits with an error suggesting `skillet create` (for new skills) or `skillet spec import` (for legacy skills)

#### Scenario: No LLM in default mode
- **WHEN** `skillet verify` is invoked without `--semantic`
- **THEN** no LLM call is made and the command completes in under 1 second for typical skill directories

## MODIFIED Requirements

### Requirement: CLI command surface

The CLI SHALL support the following user-facing commands: `create`, `improve`, `eval`, `verify`, `add-eval`, `install`, and `spec` (with subcommands `init`, `show`, `refine`, `import`). The `create` and `improve` commands are agentic (LLM-driven) and operate via the spec. The `eval`, `verify` (without `--semantic`), `spec show`, and `install` commands are mechanical. The `spec init`, `spec refine`, `spec import`, `add-eval`, `create`, `improve`, and `verify --semantic` commands invoke LLMs. There is no standalone `validate` or `generate` command — per-file structural checks are layer 1 of `verify`, and regeneration runs automatically after every spec mutation.

#### Scenario: Create command
- **WHEN** `skillet create "description of skill"` is run
- **THEN** the system creates a new skill directory with `spec.yaml` (via spec init), generates SKILL.md and eval files from the spec, runs evals, and iterates

#### Scenario: Create with explicit path
- **WHEN** `skillet create "description" --path ./my-skill` is run
- **THEN** the skill is created at the specified path

#### Scenario: Create fails if SKILL.md or spec exists
- **WHEN** `skillet create` targets a directory that already contains `SKILL.md` or `spec.yaml`
- **THEN** the command exits with an error suggesting `skillet improve` or `skillet spec refine` instead

#### Scenario: Improve command with existing spec
- **WHEN** `skillet improve [path]` is run against a directory containing `spec.yaml`
- **THEN** the system runs `generate`, runs evals, and iterates with structured patches

#### Scenario: Improve command auto-imports legacy skill
- **WHEN** `skillet improve [path]` is run against a directory with SKILL.md but no `spec.yaml`
- **THEN** the system auto-runs `spec import`, regenerates derived files, then iterates without prompting the user

#### Scenario: Improve fails if no SKILL.md and no spec
- **WHEN** `skillet improve` targets a directory with neither `SKILL.md` nor `spec.yaml`
- **THEN** the command exits with an error suggesting `skillet create` instead

#### Scenario: Add-eval modifies the spec
- **WHEN** `skillet add-eval [path] "<behavior statement>"` is run
- **THEN** a new behavior entry is appended to `spec.yaml` with an LLM-generated `eval` block, then `generate` is run to refresh derived files

#### Scenario: Add-eval auto-imports legacy skill
- **WHEN** `skillet add-eval` runs against a skill directory without `spec.yaml`
- **THEN** the system auto-runs `spec import` first, then appends the behavior

#### Scenario: Eval command with JSON
- **WHEN** `skillet eval [path] --json` is run
- **THEN** structured JSON results are written to stdout. The `eval` command does not regenerate derived files.

#### Scenario: Help text
- **WHEN** `skillet --help` is run
- **THEN** all top-level commands are listed (`create`, `improve`, `eval`, `verify`, `add-eval`, `install`, `spec`) with brief descriptions, and `skillet spec --help` enumerates the subcommands (`show`, `refine`, `import`)
