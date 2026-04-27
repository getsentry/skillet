## MODIFIED Requirements

### Requirement: Agentic skill authoring loop

The system SHALL provide an `authorSkill()` function that orchestrates spec-driven skill creation and improvement. The loop SHALL proceed through these phases: establish spec (init for new, import for legacy, load for existing) → regenerate SKILL.md and eval cases from spec → verify coverage (structural) → run evals → verify results (per-behavior) → assess failures into structured spec patches → apply patches and regenerate → iterate if needed.

#### Scenario: Create skill from scratch
- **WHEN** `authorSkill` is called with mode `create` and a natural-language description
- **THEN** the system runs the spec-init phase (LLM dialogue) to produce `spec.yaml` from the description, regenerates SKILL.md and eval cases, runs verify and evals, and iterates until verify passes or max iterations reached

#### Scenario: Improve existing skill with no spec
- **WHEN** `authorSkill` is called with mode `improve` against a skill directory that has SKILL.md but no `spec.yaml`
- **THEN** the system runs the spec-import phase to reverse-engineer a `spec.yaml` from the existing SKILL.md and eval files, regenerates derived files, and enters the normal iteration loop

#### Scenario: Improve existing skill with spec
- **WHEN** `authorSkill` is called with mode `improve` against a skill directory that already has `spec.yaml`
- **THEN** the system regenerates derived files (idempotent), runs verify and evals, and enters the iteration loop

#### Scenario: Shared core between create and improve
- **WHEN** either mode is invoked
- **THEN** both use the same iteration loop after spec is established; the only difference is the spec-creation phase (init from description vs. import from prose vs. load from disk)

### Requirement: Phase-based LLM calls

Each phase of the authoring loop SHALL use a separate focused LLM call with phase-specific system prompts and reference material. Each prompt SHALL accept structured spec data (or structured spec patches) as input rather than free-text descriptions.

#### Scenario: Spec init phase
- **WHEN** the spec init phase runs
- **THEN** the LLM receives the user's description plus skill-writer pattern guidance and produces a `spec.yaml` content (intent, triggers, initial behaviors, must_nots) optionally after asking clarifying questions

#### Scenario: Skill generation phase
- **WHEN** the skill generation phase runs
- **THEN** the LLM receives the parsed `SkillSpec` object plus skill-writer pattern guidance and produces SKILL.md content

#### Scenario: Eval generation phase
- **WHEN** the eval generation phase runs
- **THEN** the LLM receives the `behaviors[]` and `must_not[]` arrays plus eval format documentation, and produces eval YAML cases — one case per behavior or must_not entry, each tagged with the corresponding ID via `tests_behavior` and named `<id>__<slug>`

#### Scenario: Assessment phase
- **WHEN** the assessment phase runs after evals and verification complete
- **THEN** the LLM receives the current spec, the eval results (with `tests_behavior` mapping each failure to a behavior or must_not ID), the `CoverageReport` from `verifyCoverage`, and the `ResultsReport` from `verifyResults`, and produces a `SpecPatch[]` JSON array of structured patch operations

#### Scenario: Spec refine phase
- **WHEN** `skillet spec refine "<feedback>"` runs
- **THEN** the LLM receives the current spec plus the user's feedback and produces a `SpecPatch[]` array; the patcher applies them and the file is rewritten

### Requirement: Iteration control

The authoring loop SHALL cap iterations at a configurable maximum (default: 3) and stop early when verification confirms every spec behavior has a passing eval case.

#### Scenario: Per-behavior pass on first run
- **WHEN** `verifyResults.ok` is `true` after the first iteration (every spec behavior has a passing case and there are no orphan cases)
- **THEN** the loop terminates without further iterations

#### Scenario: Raw eval pass without coverage does not terminate
- **WHEN** raw eval results show `summary.fail === 0` but `verifyResults.ok` is `false` (e.g., a behavior is uncovered or all its cases were skipped)
- **THEN** the loop continues; the verification gaps feed assessment

#### Scenario: Max iterations reached
- **WHEN** the maximum iteration count is reached and verification still fails
- **THEN** the loop terminates and reports the final state including which behavior IDs are uncovered, failing, or have only-skipped cases

#### Scenario: Custom iteration limit
- **WHEN** the user specifies `--max-iterations N`
- **THEN** the loop uses N as the maximum iteration count

#### Scenario: Coverage failure short-circuits an iteration
- **WHEN** `verifyCoverage` returns `ok: false` after regen (eval-gen produced fewer cases than there are behaviors)
- **THEN** the iteration skips eval execution, feeds the coverage gaps to assessment, applies patches, and regenerates before running evals on the next iteration

#### Scenario: Iteration applies spec patches
- **WHEN** the assessment phase produces a non-empty `SpecPatch[]` array
- **THEN** the patcher applies the patches to `spec.yaml`, regen is invoked to refresh SKILL.md and evals, and the next iteration runs verify and evals on the regenerated artifacts

#### Scenario: Iteration produces empty patch set
- **WHEN** the assessment phase produces an empty `SpecPatch[]` array but verification still fails
- **THEN** the loop terminates immediately with the verification report and failures reported (no infinite loop on the assessor giving up)

### Requirement: Bundled skill-writer knowledge

Skillet SHALL ship reference material covering skill authoring quality standards. This material SHALL be loaded from static files bundled in the npm package and injected into system prompts during authoring phases. The reference material SHALL be updated to describe the spec-driven flow, including how behaviors map to eval cases.

#### Scenario: Reference material available at runtime
- **WHEN** the authoring loop starts
- **THEN** reference files for skill patterns, authoring guidance, and eval examples are loadable from the package's `references/` directory

#### Scenario: Reference material describes spec-driven flow
- **WHEN** an authoring phase loads reference material
- **THEN** the loaded content describes the spec-driven generation model (one eval case per behavior, behavior IDs as the join key) rather than the prose-driven flow

#### Scenario: No external dependencies for knowledge
- **WHEN** skillet runs in an offline environment
- **THEN** all skill-writer knowledge is available from bundled files without network access
