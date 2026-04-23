### Requirement: Agentic skill authoring loop

The system SHALL provide an `authorSkill()` function that orchestrates multi-phase LLM-driven skill creation and improvement. The loop SHALL proceed through these phases: understand intent → generate/refine SKILL.md → generate/add eval cases → run evals → assess results → iterate if needed.

#### Scenario: Create skill from scratch
- **WHEN** `authorSkill` is called with mode `create` and a natural-language description
- **THEN** the system generates a SKILL.md following skill-writer quality standards, generates eval cases, runs them, and iterates until evals pass or max iterations reached

#### Scenario: Improve existing skill
- **WHEN** `authorSkill` is called with mode `improve` and a path to an existing SKILL.md
- **THEN** the system reads the existing skill, generates new eval cases (or adds to existing), optionally refines the SKILL.md wording, runs evals, and iterates

#### Scenario: Shared core between create and improve
- **WHEN** either mode is invoked
- **THEN** both use the same authoring loop after initialization; the only difference is whether SKILL.md is generated from scratch or read from disk

### Requirement: Phase-based LLM calls

Each phase of the authoring loop SHALL use a separate focused LLM call with phase-specific system prompts and reference material, rather than a single monolithic prompt.

#### Scenario: Skill generation phase
- **WHEN** the skill generation phase runs
- **THEN** the LLM receives skill-writer pattern guidance, the user's description, and any existing skill content as context

#### Scenario: Eval generation phase
- **WHEN** the eval generation phase runs
- **THEN** the LLM receives the current SKILL.md content, eval format documentation, and eval examples as context

#### Scenario: Assessment phase
- **WHEN** the assessment phase runs after evals complete
- **THEN** the LLM receives eval results (pass/fail/judge output) and the current SKILL.md, and produces targeted improvement suggestions

### Requirement: Iteration control

The authoring loop SHALL cap iterations at a configurable maximum (default: 3) and stop early if all evals pass.

#### Scenario: All evals pass on first run
- **WHEN** all eval cases pass after the first iteration
- **THEN** the loop terminates without further iterations

#### Scenario: Max iterations reached
- **WHEN** the maximum iteration count is reached and evals still fail
- **THEN** the loop terminates and reports the final state including remaining failures

#### Scenario: Custom iteration limit
- **WHEN** the user specifies `--max-iterations N`
- **THEN** the loop uses N as the maximum iteration count

### Requirement: Bundled skill-writer knowledge

Skillkit SHALL ship reference material covering skill authoring quality standards. This material SHALL be loaded from static files bundled in the npm package and injected into system prompts during authoring phases.

#### Scenario: Reference material available at runtime
- **WHEN** the authoring loop starts
- **THEN** reference files for skill patterns, authoring guidance, and eval examples are loadable from the package's `references/` directory

#### Scenario: No external dependencies for knowledge
- **WHEN** skillkit runs in an offline environment
- **THEN** all skill-writer knowledge is available from bundled files without network access
