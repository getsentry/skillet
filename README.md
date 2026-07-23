<p align="center">
  <img src="docs/src/assets/skillet-logo.png" alt="Skillet" width="220">
</p>

# Skillet

Build agent skills from a reviewable spec, evaluate their behavior, and improve them over time.

A Skillet skill has three parts:

- `spec.md` defines the skill's intent and required behaviors.
- `SKILL.md` gives the agent its instructions.
- `evals/cases/*.yaml` tests those behaviors in fresh workspaces.

Skillet scaffolds, validates, and evaluates those files. It never calls a model API or handles API keys; it invokes your existing agent CLI for authoring and evals.

## Get Started

Skillet requires Node.js 20 or newer.

```bash
npx -y @sentry/skillet@latest init
```

With pnpm, use `pnpx @sentry/skillet@latest init` instead. The explicit
`@latest` keeps agent-driven authoring on the current CLI and instructions.

`init` installs the [`skillet-authoring` skill](https://github.com/getsentry/skillet/tree/main/skills/skillet-authoring) in user scope so your agent knows how to use the CLI. It uses [dotagents](https://github.com/getsentry/dotagents) and asks before writing under `~/.agents`.

If you prefer a global binary, install it explicitly:

```bash
npm install -g @sentry/skillet
skillet init
```

Installed binaries check npm at most once per hour and suggest the current `npx` command when an update is available. If your agent reads skills from somewhere else, copy the [`skills/skillet-authoring`](https://github.com/getsentry/skillet/tree/main/skills/skillet-authoring) directory directly into that location.

To install the authoring skill with dotagents directly:

```bash
npx -y @sentry/dotagents@latest --user add getsentry/skillet skillet-authoring
```

`add` records and installs the skill immediately. Run `npx -y @sentry/dotagents@latest --user install` later to refresh it.

Or ask your agent to install the [`skillet-authoring` skill](https://github.com/getsentry/skillet/tree/main/skills/skillet-authoring) for you.

## Create a skill

Ask your agent:

> Create a skill that enforces our commit conventions.

The authoring skill handles the workflow: scaffold the files, clarify the behavior, write the spec, render the agent instructions, add eval cases, validate everything, and run the evals.

To start manually instead:

```bash
npx -y @sentry/skillet@latest new commit-conventions
cd commit-conventions
npx -y @sentry/skillet@latest status
```

`skillet status` reads the files on disk and tells you the next step. When writing an artifact yourself, use `skillet instructions spec`, `skillet instructions skill`, or `skillet instructions evals` for its current format and rules.

For an existing skill, run `skillet status <path>`. Uppercase `SPEC.md` and structurally invalid lowercase `spec.md` are treated as migration input; preserve or rename the legacy content, then derive a valid lowercase `spec.md` before adding eval coverage. Inventory the old skill's triggers, workflow, exact lists and protocols, thresholds, stop rules, constraints, and runtime references first, then reconcile that inventory against the new spec and rendered skill instead of assuming a shorter rewrite is equivalent.

## Validate and evaluate

```bash
npx -y @sentry/skillet@latest validate
npx -y @sentry/skillet@latest eval --dry
npx -y @sentry/skillet@latest eval --trials 3 --baseline
```

- `validate` checks the spec grammar, `SKILL.md` frontmatter, eval schemas, and behavior coverage.
- `eval --dry` finds cases that a do-nothing agent would pass.
- `eval --baseline` runs each case with and without the skill and reports the difference as lift.

Eval runs invoke real agent CLI sessions. They use that CLI's configured account and model.

Example output:

```text
Behaviors:
  conventional-subject: 100% (3/3) | baseline 33% | lift +67%
  branch-safety:        100% (3/3) | baseline 0%  | lift +100%
```

Lift answers a concrete question: did this skill improve the agent's behavior? Zero lift is useful too—it means the configured agent already passed without the skill.

## Write an eval case

A behavior in `spec.md`:

```markdown
### Behavior: Conventional subject

The agent SHALL write commit subjects as `<type>(<scope>): <description>`.

#### Scenario: Committing a staged bug fix

- **WHEN** the workspace has a staged bug fix and the user asks to commit
- **THEN** the commit subject starts with `fix` and stays under 70 characters
```

One case that covers it:

```yaml
behavior: conventional-subject
prompt: |
  I fixed the null check in app.js—please commit my staged change.
setup: |
  git init -q -b main
  git add -A
checks:
  - shell: git log -1 --format=%s | grep -Eq '^(feat|fix|chore)'
  - judge: The commit message accurately describes the null-check fix.
```

Checks inspect the resulting workspace, not just the agent's response. Use `file_exists` and `shell` for deterministic checks; use `judge` when the requirement needs semantic evaluation. See [`examples/`](examples/) for a small skill plus full Garfield and Effect conversions with preserved upstream snapshots.

## Commands

| Command | Purpose |
|---|---|
| `skillet init` | Install the authoring skill with dotagents |
| `skillet new <name>` | Create a skill scaffold |
| `skillet status [path]` | Show artifact state and the next step |
| `skillet instructions <artifact>` | Print the format and rules for `spec`, `skill`, or `evals` |
| `skillet validate [path]` | Validate the complete skill |
| `skillet eval [path]` | Run eval cases through an agent CLI |
| `skillet show [path]` | Print the parsed spec and coverage |

Every command supports `--json`. Agent-driven workflows use
`npx -y @sentry/skillet@latest <command>` (or the `pnpx` equivalent); the table
uses `skillet` as shorthand. Run `skillet <command> --help` for command-specific options.

## Harnesses and safety

Skillet uses Codex by default and has built-in support for Claude Code. Select one with `--harness codex` or `--harness claude`, optionally with a model suffix such as `--harness claude:sonnet`. You can configure another CLI in `.skillet.yaml`.

By default, eval agents run directly on your machine with full access. Use this only for skills and evals you trust. For untrusted skills or CI, build the included Docker image and run with `--sandbox docker`.

See [`LIFECYCLE.md`](LIFECYCLE.md) for the artifact flow, eval execution model, harness configuration, and sandbox details.
