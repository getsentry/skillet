## Why

Skillkit v1 was designed as a human-facing CLI that runs pre-written evals. The real use case has become clear: skillkit should be an **agentic skill authoring tool** — given a description of what a skill should do, it creates the skill, generates evals, runs them, and iterates until quality bars are met. It also needs to improve existing skills by adding evals and refining instructions. The current architecture (Vercel AI SDK, no creation flow, no structured output, ANSI-only reporting) doesn't support this.

## What Changes

- **`create` command becomes agentic**: Given a natural-language description, skillkit uses an LLM (with baked-in skill-writer knowledge) to generate SKILL.md, generate eval cases, run them, and iterate. Not a dumb scaffold — a full authoring loop.
- **`improve` command for existing skills**: Takes a path to an existing SKILL.md, generates/adds evals, optionally rewords the skill, runs evals, iterates. `create` and `improve` converge — `create` is `improve` with no pre-existing SKILL.md.
- **`eval` stays as pure mechanical execution**: Runs existing evals, reports results. Adds `--json` flag for structured output consumable by agents.
- **`iterate` command removed**: The iteration loop is internal to `create`/`improve`, not a separate command.
- **Eval result format aligns with vitest-evals**: Output shape uses normalized sessions, usage summaries, and structured judge results — not using vitest-evals as a dependency yet, but the format is compatible so future migration is a rename.
- **`validate` command added**: Structural lint for SKILL.md + eval files — cheap pre-flight check before expensive LLM eval runs.
- **Skill-writer knowledge baked into skillkit**: Quality standards for skill authoring (patterns, depth gates, trigger optimization) ship as reference material inside skillkit, used as system prompt context during creation/improvement.
- **BREAKING**: Old spec surface (`agent`, `cli`, `eval-format`, `judge`, `skill-loader`, `workspace`) is being replaced wholesale. The eval format and agent runtime remain similar but are re-specified under the new model.

## Capabilities

### New Capabilities
- `skill-authoring`: The agentic create/improve flow — LLM-driven skill generation, eval generation, and iterative improvement with baked-in quality standards.
- `structured-output`: JSON output mode for eval results, validation results, and creation progress — designed for agent consumption.
- `validation`: Structural linting of SKILL.md frontmatter, eval file parsing, reference file existence, and description quality signals.

### Modified Capabilities
- `cli`: Command surface changes from `eval|create|iterate` to `create|improve|eval|validate`. `create` and `improve` are agentic. `--json` flag added to `eval`.
- `eval-format`: Eval result shape normalizes toward vitest-evals (`NormalizedSession`, `UsageSummary`, `HarnessRun`-compatible). YAML case definition stays.
- `agent`: Agent runtime now serves two roles — executing eval cases (as before) AND driving skill authoring/improvement. System prompt construction changes for authoring mode.
- `judge`: Judge results fold into the normalized output format. Judge invocation logic unchanged.

## Impact

- All existing specs are superseded and need rewriting.
- `src/commands/eval.ts` gains `--json` path.
- `src/cli.ts` command dispatch changes.
- New `src/commands/create.ts`, `src/commands/improve.ts`, `src/commands/validate.ts`.
- New `src/authoring/` module for skill-writer knowledge and authoring prompts.
- `src/eval/runner.ts` result types change to normalized format.
- `package.json` description and bin entry unchanged.
