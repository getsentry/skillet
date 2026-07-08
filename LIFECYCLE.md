# Skill Lifecycle

How a skill is built and proven end-to-end. Authoritative reference for the artifact flow — what exists, who writes it, and what checks it.

## The artifacts

```
my-skill/
  spec.md              # source of truth: intent, triggers, behaviors+scenarios, constraints
  SKILL.md             # agent-rendered instruction text (frontmatter: name, description)
  references/*.md      # optional detail files linked from SKILL.md
  evals/
    cases/<id>.yaml    # one declarative case per file, linked to a behavior by slug
    fixtures/<slug>/   # starting workspace states for cases
```

Who writes what: **humans and host agents** write all artifacts (via the `/skillet:*` workflows and `skillet instructions`); **skillet** scaffolds, validates, serves instructions, and runs evals. Skillet never calls an LLM and never overwrites an existing artifact.

## The flow

```
skillet new <name>            # scaffold spec.md template + evals/ layout
     |
/skillet:propose              # host agent interviews the user, writes spec.md
     |                        #   guided by: skillet instructions spec --json
skillet validate              # grammar: behaviors have scenarios, slugs unique, WHEN/THEN present
     |
/skillet:render               # host agent writes SKILL.md (+references) and eval cases
     |                        #   guided by: skillet instructions skill|evals --json
skillet validate              # + frontmatter, case schema, behavior<->case coverage
     |
skillet eval [--trials N] [--baseline]
     |                        # per case x trial: fresh workspace -> fixture copy -> setup
     |                        #   -> harness agent runs prompt -> deterministic checks
     |                        #   -> judge checks (harness-graded, only if deterministic pass)
     |                        # --baseline repeats trials without the skill; reports lift
/skillet:improve              # host agent diagnoses failures -> fixes spec, SKILL.md, or case
     |
(loop until behaviors hold and lift is positive)
```

`skillet status` reports where in this flow a skill is, purely from files on disk (presence + spec.md mtime vs SKILL.md). Legacy skills (a `spec.yaml`, or a `SKILL.md` with no `spec.md`) are detected and routed to `/skillet:migrate`.

## Eval execution detail

Per trial (see `src/evals/runner.ts`):

1. `mkdtemp` workspace; copy `evals/fixtures/<slug>/` in when the case declares `fixture:`.
2. Run `setup:` with cwd = workspace; the script itself is staged outside the workspace so it can never appear in workspace contents or git state. 30s timeout; non-zero exit → trial `error`, agent never spawns.
3. Install the skill using the harness's native mechanism — `.claude/skills/` (claude), workspace `AGENTS.md` + staged skill dir (codex), `skill_dir` template (custom). Baseline trials skip this step.
4. Spawn the harness CLI on the case prompt (per-case `timeout:`, default 300s; kill reaps the whole process group). Capture transcript + final message. Direct execution with full access is the default (trusting your own skill); with `--sandbox docker` the invocation — judges included — is wrapped in a container with the workspace mounted at `/workspace`.
5. Run `file_exists` / `shell` checks in the workspace. If all pass, grade each `judge:` check by running the harness again in an isolated directory with a grading prompt (criterion + case prompt + transcript + bounded workspace dump) and a strict trailing `VERDICT: pass|fail` protocol — one retry, then `error` (never a silent fail).
6. Trial status: `pass` (all checks pass), `fail` (a check failed), `error` (setup/timeout/judge-parse trouble). Workspaces are removed unless `--keep-workspaces`.

Results roll up per behavior: pass rate over all trials of all covering cases, plus baseline pass rate and **lift** when `--baseline` ran.

Baseline caveat: harness CLIs still load the user's global configuration, so baseline measures *your configured agent without this skill*, not a bare model. That is usually the comparison you want; keep it in mind when reading lift.

## Where things live in src/

| Concern | Module |
|---|---|
| spec grammar, parser, template | `src/spec/` |
| SKILL.md frontmatter + skill-root discovery | `src/skill/` |
| behavior↔case coverage | `src/coverage.ts` |
| case schema, workspace, checks, runner, lift | `src/evals/` |
| harness config/spawn/install/judge | `src/harness/` |
| instructions payloads | `src/instructions/content.ts` |
| workflow file generation | `src/integration/` |
| state + validation aggregators | `src/status.ts`, `src/validate.ts` |
| CLI dispatch + commands | `src/cli.ts`, `src/commands/` |
