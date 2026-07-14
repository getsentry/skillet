# Skill Lifecycle

How a skill is built and proven end-to-end. Authoritative reference for the artifact flow — what exists, who writes it, and what checks it.

## The artifacts

```
my-skill/
  spec.md              # source of truth: intent, triggers, behaviors+scenarios, constraints
  SKILL.md             # agent-rendered instruction text (frontmatter: name, description, spec_hash)
  references/*.md      # optional detail files linked from SKILL.md
  evals/
    cases/<id>.yaml    # one declarative case per file, linked to a behavior by slug
    fixtures/<slug>/   # starting workspace states for cases
```

Who writes what: **humans and host agents** write all artifacts (via the skillet-authoring skill and `skillet instructions`); **skillet** scaffolds, validates, serves instructions, and runs evals. Skillet never calls an LLM and never overwrites an existing artifact.

## The flow

```
skillet new <name>            # scaffold spec.md template + evals/ layout
     |
agent authors spec.md         # host agent interviews the user, writes spec.md
     |                        #   guided by: skillet instructions spec --json
skillet validate              # grammar: behaviors have scenarios, slugs unique, WHEN/THEN present
     |
agent renders artifacts       # host agent writes SKILL.md (+references) and eval cases
     |                        #   guided by: skillet instructions skill|evals --json
skillet validate              # + frontmatter, case schema, behavior<->case coverage
     |
skillet eval [--trials N] [--baseline] [--dry] [--out dir]
     |                        # per case x trial: fresh workspace -> fixture copy -> setup
     |                        #   -> harness agent runs prompt -> deterministic checks
     |                        #   -> judge checks (harness-graded, only if deterministic pass)
     |                        # --baseline repeats trials without the skill; reports lift
agent improves                # host agent diagnoses failures -> fixes spec, SKILL.md, or case
     |
(loop until behaviors hold and lift is positive)
```

`skillet status` reports where in this flow a skill is, purely from files on disk (presence + the spec_hash recorded in SKILL.md vs the hash of spec.md; mtime fallback when no hash is recorded). Legacy skills (a `spec.yaml`, or a `SKILL.md` with no `spec.md`) are detected and status directs the migration.

## Eval execution detail

`skillet eval` compiles cases into generated test files in a temp directory and runs them through an embedded Vitest + [vitest-evals](https://github.com/getsentry/vitest-evals) engine (`src/engine/`) — one vitest test per trial, serially, invisible to the user (no config, nothing written to the skill directory). `--report <file>` additionally writes a Vitest JSON report artifact for `npx vitest-evals serve` and the `getsentry/vitest-evals` GitHub Action.

Per trial (see `src/engine/worker.ts`):

1. `mkdtemp` workspace; copy `evals/fixtures/<slug>/` in when the case declares `fixture:`.
2. Run `setup:` with cwd = workspace; the script itself is staged outside the workspace so it can never appear in workspace contents or git state. 30s timeout; non-zero exit → trial `error`, agent never spawns.
3. Install the skill using the harness's native mechanism — `.claude/skills/` (claude), workspace `AGENTS.md` + staged skill dir (codex), `skill_dir` template (custom). Baseline trials skip this step.
4. Spawn the harness CLI on the case prompt (per-case `timeout:`, default 300s; kill reaps the whole process group). Capture transcript + final message. Direct execution with full access is the default (trusting your own skill); with `--sandbox docker` the invocation — judges included — is wrapped in a container with the workspace mounted at `/workspace`.
5. Run `file_exists` / `shell` checks in the workspace as native test assertions. If all pass, grade each `judge:` check through a vitest-evals judge whose judge harness runs the same agent CLI in an isolated directory with a grading prompt (criterion + case prompt + transcript + bounded workspace dump) and a strict trailing `VERDICT: pass|fail` protocol — one retry, then `error` (never a silent fail).
6. Trial status: `pass` (all checks pass), `fail` (a check failed), `error` (setup/timeout/judge-parse trouble). Workspaces are removed unless `--keep-workspaces`.

Results roll up per behavior: pass rate over all trials of all covering cases, plus baseline pass rate and **lift** when `--baseline` ran.

Baseline caveat: harness CLIs still load the user's global configuration, so baseline measures *your configured agent without this skill*, not a bare model. That is usually the comparison you want; keep it in mind when reading lift.

## Where things live in src/

| Concern | Module |
|---|---|
| spec grammar, parser, template | `src/spec/` |
| SKILL.md frontmatter + skill-root discovery | `src/skill/` |
| behavior↔case coverage | `src/coverage.ts` |
| case schema, workspace, checks, dry-run, lift | `src/evals/` |
| harness config/spawn/install/judge | `src/harness/` |
| vitest-evals engine (compile/worker/orchestrate) | `src/engine/` |
| instructions payloads | `src/instructions/content.ts` |
| state + validation aggregators | `src/status.ts`, `src/validate.ts` |
| CLI dispatch + commands | `src/cli.ts`, `src/commands/` |
