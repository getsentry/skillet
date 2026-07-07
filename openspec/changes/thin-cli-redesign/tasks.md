# Tasks — Thin CLI Redesign

## 1. Clear the ground

- [x] 1.1 Archive the three stale active changes (`2026-05-04-agent-orchestration`, `2026-05-03-pi-ai-harness-adoption`, `2026-05-03-vitest-evals-upstream-migration`) without spec sync
- [x] 1.2 Delete `src/authoring/`, `src/agents/`, `src/agent/`, `src/eval/`, `src/evals/`, `src/staging/`, `src/verify/`, `src/cli/` (transport/pause/job-summary), and the command files for create/improve/spec/add-eval/resume/compare/install
- [x] 1.3 Extract salvage: slug logic from `src/spec/slug.ts`, frontmatter parsing from `src/skill/`, fixture-copy from `src/evals/with-workspace.ts`, writing guidance worth keeping from `agents/*/references/`
- [x] 1.4 Remove deps `@mariozechner/pi-agent-core`, `@mariozechner/pi-ai`, `@vitest-evals/harness-pi-ai`, `vitest-evals`; keep vitest as a devDependency for unit tests only
- [x] 1.5 Delete all `SKILLET_*` env var handling, `.skillet-tmp/` machinery, and `bench/` (superseded by `--baseline`)

## 2. skill-spec: grammar, parser, validator

- [x] 2.1 Define the spec.md template (Intent, Triggers, Behaviors/Scenarios, Constraints) and grammar constants
- [x] 2.2 Implement the markdown parser producing `{intent, triggers, behaviors[{id, name, text, scenarios[]}], constraints[]}` with line-accurate error positions
- [x] 2.3 Implement structural validation with fix hints (missing scenario, wrong heading depth, duplicate slugs) and unit tests over valid/invalid corpora
- [x] 2.4 Implement behavior↔eval coverage checks (uncovered behavior = warning, unknown behavior ref = error, missing fixture = error)

## 3. Eval cases and workspace

- [x] 3.1 Define the YAML case schema (`behavior`, `prompt`, `fixture`, `setup`, `checks`, `trials`, `timeout`) and schema validation with unit tests
- [x] 3.2 Implement workspace lifecycle: fresh tempdir per trial, fixture copy, setup script materialized outside the workspace, 30s setup timeout, teardown, `--keep-workspaces`
- [x] 3.3 Implement check evaluation: `file_exists`, `shell` (exit-code), ordering (deterministic before judge), per-check results with output capture

## 4. Harness

- [x] 4.1 Implement the harness abstraction: command template substitution (`{workspace}`, `{prompt}`), subprocess spawn, transcript capture, per-case timeout and kill
- [x] 4.2 Implement the codex adapter (default): non-interactive invocation, skill installation into the workspace's codex skill location — verify the current codex CLI mechanism as part of this task
- [x] 4.3 Implement the claude adapter (`claude -p`) with its skill installation path
- [x] 4.4 Implement custom harness config in `.skillet.yaml` with placeholder validation and fail-fast on missing binary
- [x] 4.5 Implement the harness-executed judge: grading prompt (criterion + case prompt + transcript + workspace diff), `VERDICT: pass|fail` protocol, one retry, errored-not-failed on unparseable output
- [x] 4.6 Implement baseline mode: paired trials without skill installation, isolated workspaces, per-behavior lift computation

## 5. CLI commands

- [ ] 5.1 `skillet new <name>`: scaffold skill directory with templated spec.md and evals/ layout
- [ ] 5.2 `skillet status [path] [--json]`: artifact presence/staleness from disk, legacy spec.yaml detection
- [ ] 5.3 `skillet instructions <spec|skill|evals> [--json]`: serve template + writing instructions + output path + state (each payload ≤200 lines)
- [ ] 5.4 `skillet validate [path] [--json]`: full-skill report (spec grammar, SKILL.md frontmatter, case schema, coverage)
- [ ] 5.5 `skillet eval [path] [--case id] [--trials n] [--baseline] [--harness x] [--json] [--keep-workspaces]`: run cases, group results by behavior, report pass rates and lift
- [ ] 5.6 `skillet show [path]`: pretty-print parsed spec with coverage summary
- [ ] 5.7 `skillet init [--tools <ids>] [--force]`: project scaffold + tool integration generation
- [ ] 5.8 Cross-cutting: `--json` single-object stdout convention, prose to stderr, exit codes 0/1

## 6. Agent integration workflows

- [ ] 6.1 Author the generated workflow content for `/skillet:propose` (interview user → write spec.md via instructions)
- [ ] 6.2 Author `/skillet:render` (spec.md → SKILL.md + references + eval cases → validate → eval)
- [ ] 6.3 Author `/skillet:improve` (read `eval --json` failures → edit spec/skill → re-run)
- [ ] 6.4 Author `/skillet:migrate` (spec.yaml or bare SKILL.md → spec.md + cases)
- [ ] 6.5 Implement generators for Claude Code (`.claude/commands/skillet/`, `.claude/skills/`) and Codex (`$CODEX_HOME/prompts/`), keeping workflow files thin (fetch instructions from CLI)

## 7. Prove it works

- [ ] 7.1 Unit test suite green (`parser`, `validator`, `schema`, `harness templating`, `check evaluation`, `lift math`) with no LLM or network access
- [ ] 7.2 Dogfood: recreate one real skill (e.g. the commit skill) end-to-end via `/skillet:propose` → `/skillet:render` → `skillet eval --trials 3 --baseline` and record the lift numbers
- [ ] 7.3 Run the same dogfood skill through both codex and claude harnesses to confirm adapter parity

## 8. Docs and release

- [ ] 8.1 Rewrite README around the new model (7 commands, spec.md grammar, eval format, harness config, baseline metric)
- [ ] 8.2 Replace LIFECYCLE.md with the new artifact flow; update AGENTS.md; delete stale policy docs that describe deleted machinery
- [ ] 8.3 Major version bump, CHANGELOG entry describing the breaking redesign and migration path
