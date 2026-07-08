# Thin CLI Redesign — Skillet as "OpenSpec for skills"

## Why

Skillet v0.x tries to do everything itself: an interactive TypeScript spec-author dialogue, an orchestrator driving four bundled Markdown-prompt agents (writer/validator fan-out with re-pass, plateau, and cap-exhaustion heuristics), generated TypeScript eval files executed through a spawned vitest subprocess with a synthesized config, LLM judges, provider credential autodiscovery, and pause/resume session persistence. The result:

- **Not proven effective.** Benchmarking never showed a statistically significant quality lift from skillet-generated skills, despite ~13 recorded rounds of orchestrator/threshold tuning (`.skillet-bench/`).
- **Too hard to use.** 12 command entry points with overlapping concepts (`create` vs `spec init`, `add-eval` vs `spec refine`), 8 env vars (at least one dead), and every meaningful command requiring live LLM credentials.
- **Too fragile.** The eval-writer alone needs ~900 lines of prompt guidance to emit correct TypeScript; `_setup.sh` was re-fixed three times; `.skillet-tmp/failed-outputs/` exists because generation fails often enough to need capture/retry infrastructure.

OpenSpec (openspec.dev) demonstrates the opposite architecture works: a CLI that makes **zero LLM calls**, manages plain-markdown artifacts with a tiny strict grammar, serves templates and instructions to whatever coding agent the user already runs, and treats the filesystem as the state machine. All intelligence stays in the host agent; the CLI provides structure, validation, and state.

This change rebuilds skillet on that model. Skillet's differentiated value is the part OpenSpec doesn't do: **a spec grammar for agent-skill intent (behaviors, triggers, constraints, scenarios) and a mechanical eval runner that proves a skill works by spawning real coding-agent CLIs against fixture workspaces.**

## What Changes

- **Skillet CLI makes zero LLM calls.** All generation (spec authoring, SKILL.md rendering, eval-case writing, improvement) moves to the host agent, driven by generated slash commands/skills (`skillet init --tools claude,codex,...`) that script the agent into a `skillet status` / `skillet instructions --json` loop — OpenSpec's "thin prompts, fat CLI" pattern.
- **`spec.yaml` becomes `spec.md`**: a human-reviewable markdown grammar (`### Behavior:` / `#### Scenario:` with WHEN/THEN, Triggers, Constraints) that codifies intent and is the source of truth for both SKILL.md and evals. Every behavior requires at least one scenario; every scenario is a potential eval case.
- **Evals become declarative YAML** (one case per file: prompt, optional fixture/setup, checks). No generated TypeScript, no vitest, no synthesized configs.
- **Evals run through a pluggable harness**: skillet materializes a workspace, installs the skill into a real coding-agent CLI (built-in adapters: `codex exec`, `claude -p`; extensible via a command template in config), runs the prompt, then evaluates checks — deterministic filesystem/shell checks plus judge checks executed through the same harness (so no API keys or provider machinery in skillet).
- **Statistical honesty built in**: `skillet eval --trials N` for repeated runs with pass-rate reporting, and `skillet eval --baseline` to run every case with and without the skill installed and report per-behavior lift — the measurement the v0.x design never made possible.
- **Command surface shrinks from 12 entry points to 7 mechanical commands**: `init`, `new`, `status`, `instructions`, `validate`, `eval`, `show`. Deleted: `create`, `improve`, `spec init/refine/import`, `add-eval`, `resume`, `compare` (subsumed by `--baseline`), `install` (subsumed by `init`).
- **Deleted machinery**: `src/authoring/`, `src/agents/` (orchestrator + bundled writer/validator agents and their ~2,000 lines of prompts), `src/agent/` (LLM lifecycle/queue/backoff), provider autodiscovery, the vitest subprocess runner, staging/atomic-swap, pause/resume sessions, and the `pi-ai`/`vitest-evals` dependency stack.

## Capabilities

### New Capabilities

- `skill-spec`: the `spec.md` artifact — grammar, parsing, and structural validation of intent (behaviors, scenarios, triggers, constraints) plus behavior↔eval coverage checking.
- `harness`: the pluggable agent-CLI harness contract — built-in codex/claude adapters, custom command templates, skill installation into the harness, transcript capture.
- `agent-integration`: `skillet init --tools`, generated slash commands/skills per tool, and `skillet instructions`/`skillet status` as the machine interface agents consume.

### Modified Capabilities

- `cli`: new 7-command surface; eval command gains `--trials`/`--baseline`/`--case`; LLM provider configuration removed.
- `eval-format`: TypeScript/vitest format replaced wholesale by declarative YAML cases linked to spec behaviors.
- `judge`: judge calls execute through the harness (spawned agent CLI with a grading prompt and structured verdict) instead of a direct provider LLM call.
- `workspace`: fixture-copy model retained and simplified; setup runs as a field of the eval case; isolation guarantees kept.
- `validation`: extends to the `spec.md` grammar, eval YAML schema, and behavior↔eval coverage; remains strictly no-LLM.
- `skill-loader`: keeps root discovery, frontmatter parsing, and directory-structure rules; drops system-prompt assembly (no built-in agent to assemble for).

### Removed Capabilities

- `agent`: the built-in minimal agent runtime — replaced by `harness` (real coding-agent CLIs).
- `provider-autodiscovery`: no LLM calls in skillet means no credentials to discover.
- `skill-authoring`: the in-process authoring loop — replaced by agent-side workflows under `agent-integration`.
- `eval-linter`: TypeScript/regex-era linting — subsumed by YAML schema validation in `validation`.
- `structured-output`: `--json` stays a cross-cutting CLI convention (specified in `cli`), no longer tied to vitest-evals normalized types.

## Impact

- **Breaking, by design.** Existing `spec.yaml` + `evals/*.eval.ts` skills are not runnable by the new CLI. Migration is agent-driven: a generated `/skillet:migrate` workflow converts `spec.yaml` → `spec.md` and eval intent → YAML cases. The user is explicitly not attached to current code.
- **Dependencies**: drops `@mariozechner/pi-agent-core`, `@mariozechner/pi-ai`, `@vitest-evals/harness-pi-ai`, `vitest-evals`, `vitest`. Runtime deps shrink to roughly `yaml` and a CLI arg parser.
- **Env vars**: all 8 `SKILLET_*` vars deleted; harness selection/config lives in `.skillet.yaml` (project) with CLI-flag override.
- **Supersedes stale active changes**: `2026-05-04-agent-orchestration`, `2026-05-03-pi-ai-harness-adoption`, and `2026-05-03-vitest-evals-upstream-migration` (all 0 tasks done) describe the architecture this change deletes; they should be abandoned/archived without sync when this change is accepted.
- **Docs**: README, LIFECYCLE.md, AGENTS.md rewritten around the new model; bundled `agents/` and `skills/skillet` reworked into the generated agent-integration workflows.

## Non-Goals

- No SaaS, accounts, daemon, or MCP server; skillet stays a local file-first CLI.
- No attempt to grade skill "quality" semantically inside the CLI — the only quality signal is eval outcomes through real agents.
- No multi-agent orchestration in skillet itself; if a host agent wants to parallelize, that's its business.
- No backwards-compatible support for the vitest eval format.
