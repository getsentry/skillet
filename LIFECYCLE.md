# How Skillet Works

This is the detailed reference for Skillet's artifact flow, eval execution, harnesses, and source layout. Start with [`README.md`](README.md) if you only need to create or run a skill.

## Artifacts

```text
my-skill/
  spec.md
  SKILL.md
  references/*.md
  evals/                     # optional
    cases/<id>.yaml
    fixtures/<slug>/
```

| Artifact | Role |
|---|---|
| `spec.md` | Source of truth for intent, triggers, behaviors, scenarios, and constraints |
| `SKILL.md` | Agent instructions derived from the spec |
| `references/*.md` | Optional detail linked from `SKILL.md` |
| `evals/cases/*.yaml` | Optional cases linked to selected spec behaviors by slug |
| `evals/fixtures/*` | Optional starting workspaces for eval cases |

Humans and host agents write these artifacts. Skillet scaffolds `spec.md`, serves format instructions, validates the core skill plus any optional cases, and runs evals only when requested. It never calls a model API directly and never overwrites an existing skill artifact.

New and revised specs end with `<!-- skillet-version: x.y.z -->`. This compact
footer records which Skillet version supplied the template and authoring
guidance; it is ignored by the semantic parser.

Agent-driven authoring invokes `npx -y @sentry/skillet@latest` or
`pnpx @sentry/skillet@latest` so the CLI-served formats and guidance stay
current. Commands below use the shorter installed-binary form for readability.

## Core artifact flow

1. Run `skillet new <name>` to create `spec.md`.
2. Write `spec.md`, using `skillet instructions spec --json` for the current grammar and template.
3. Run `skillet validate` to catch invalid or incomplete behaviors.
4. Write `SKILL.md`, using `skillet instructions skill --json` and recording the current spec hash.
5. Run `skillet validate` again. A valid spec and current SKILL.md complete ordinary authoring.

## Optional eval flow

Enter this flow only when the user chooses to create or run evals:

1. Select the high-value scenarios that need repeatable measurement; complete behavior coverage is not required.
2. Write cases with `skillet instructions evals --json`, creating `evals/cases/` and fixtures as needed.
3. Run `skillet validate` to check case schemas, spec links, and fixtures.
4. Run `skillet eval --dry`, then the explicitly requested normal or baseline evaluation. Add `--trials <n>` only when repeated observations are useful.
5. Diagnose failures at the right layer: change the spec when the intent is wrong, `SKILL.md` when the instructions are weak, or the case when the test is unfair.

`skillet status` derives the current state entirely from disk. It compares the hash recorded in `SKILL.md` with the current `spec.md` and reports one next step.

Before artifact work, status also compares the standard user-scoped `~/.agents/skills/skillet-authoring/SKILL.md` hash with the authoring contract bundled into the current CLI. A stale dotagents-managed installation becomes the next step with a scoped reinstall command; a stale installation with unknown ownership points back to the method that originally installed it. After reinstallation, the agent reruns status. Reading the reinstalled skill is necessary only to continue in the same session; a host that snapshots skills starts a new session instead. The check is read-only, leaves current and absent installations alone, and cannot discover arbitrary custom locations.

Artifact names are case-sensitive contracts even on case-insensitive filesystems. Uppercase `SPEC.md` is treated as legacy migration input, never as the active Skillet `spec.md`. A lowercase file must also pass the Skillet grammar before the workflow advances. Until a valid lowercase spec exists, optional eval case schemas can be checked but their behavior links cannot.

Migrating an existing skill is a reconciliation pass, not a compression pass. Before writing `spec.md`, inventory the legacy triggers, ordered workflow, exact enumerations, protocols and output formats, numeric thresholds, failure and stop rules, constraints, runtime references, and maintenance docs that describe active behavior. Every accepted behavioral rule must land in the new spec; verbose execution detail may additionally remain in a linked runtime reference after the spec defines the observable contract. After rendering, account for every removed legacy rule and search maintenance docs for stale artifact paths, prompt locations, runtime-section claims, descriptions, and coverage before calling the migration complete.

## Eval execution

`skillet eval` compiles each case into an embedded Vitest test and runs it through [vitest-evals](https://github.com/getsentry/vitest-evals). Generated files live in a temporary directory; nothing is added to the skill.

Each trial follows the same sequence:

1. Create a fresh temporary workspace and copy the case fixture, if configured.
2. Run the case's `setup` script without repository-local Git environment variables from the caller. A non-zero exit or timeout ends the trial as an error.
3. Install the skill using the selected harness's native mechanism. Baseline trials skip this step.
4. Run the agent CLI on the case prompt and capture its transcript and final response.
5. Run deterministic `file_exists` and `shell` checks against the workspace.
6. If deterministic checks pass, run each `judge` criterion through an isolated grading invocation.
7. Record the trial as `pass`, `fail`, or `error`, then remove the workspace unless `--keep-workspaces` is set.

Results are grouped by behavior. With `--baseline`, Skillet reports the pass rate without the skill and the difference between the two rates as lift.

The baseline still includes the user's global agent configuration. It measures your configured agent without this skill, not a bare model.

Use `--report <file>` to write a Vitest JSON report for `npx vitest-evals serve` or the `getsentry/vitest-evals` GitHub Action.

## Harness configuration

The default harness is Codex (`codex exec`). Claude Code (`claude -p`) is also built in.

Skillet does not choose a model unless one is configured. Built-in harnesses
default to low effort for both trials and judges. Cases remain ordered, while
trials and skill/baseline variants within one case run with a default concurrency
of four. Baseline runs only when `--baseline` is passed.

```bash
skillet eval --harness codex
skillet eval --harness claude:sonnet
```

Configure another CLI in `.skillet.yaml`:

```yaml
harness:
  name: my-agent
  command: "my-agent run --dir {workspace} {prompt}"
  skill_dir: "{workspace}/.my-agent/skills"
```

Claude skills are installed under `.claude/skills/`. Codex receives the skill through a workspace `AGENTS.md`. Custom harnesses use `skill_dir`. Baseline trials run with no skill installation.

## Sandboxed evals

By default, Codex runs with `--dangerously-bypass-approvals-and-sandbox` and Claude Code runs with `--dangerously-skip-permissions`. The workspace is disposable, but the agent process has access to the host machine.

For untrusted skills or CI, run the agent and judge processes in Docker:

```bash
docker build -t skillet-eval sandbox/
skillet eval --sandbox docker
```

The container mounts the trial workspace at `/workspace`. Checks still run on the host against that mounted workspace.

Configure sandbox defaults in `.skillet.yaml`:

```yaml
sandbox:
  enabled: true
  image: skillet-eval
  mount_auth: ["~/.codex", "~/.claude", "~/.claude.json"]
  network: true
  env: ["ANTHROPIC_API_KEY"]
```

On macOS, Claude Code OAuth credentials live in Keychain and cannot be mounted into Docker. Use Codex in the sandbox or pass `ANTHROPIC_API_KEY` through `env`.

## Source layout

| Concern | Module |
|---|---|
| Spec grammar, parser, template, and slugs | `src/spec/` |
| `SKILL.md` frontmatter and skill discovery | `src/skill/` |
| Optional eval-to-spec links | `src/coverage.ts` |
| Case schema, workspace checks, dry runs, and results | `src/evals/` |
| Harness config, process execution, installation, and judges | `src/harness/` |
| Vitest compilation, workers, and orchestration | `src/engine/` |
| Authoring instructions | `src/instructions/` |
| Cross-artifact status and validation | `src/status.ts`, `src/validate.ts` |
| CLI commands | `src/cli.ts`, `src/commands/` |
