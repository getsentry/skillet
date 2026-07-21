---
title: CLI
description: Reference for Skillet's command surface and common eval options.
type: reference
summary: Every command supports JSON output; command help remains authoritative for all flags.
---

```text
skillet <command> [options]
```

Every command supports `--json`. Machine output is one JSON object on stdout; human progress and errors go to stderr.

Run `skillet <command> --help` for the complete current option list.

## Commands

| Command | Purpose |
|---|---|
| `skillet init` | Install the `skillet-authoring` skill through dotagents |
| `skillet new <name>` | Create `spec.md` and the eval directory layout |
| `skillet status [path]` | Report artifact state and one next step |
| `skillet instructions <artifact> [path]` | Print the template and writing rules for `spec`, `skill`, or `evals` |
| `skillet validate [path]` | Validate the spec, skill, cases, fixtures, and coverage |
| `skillet eval [path]` | Run eval cases through the configured harness |
| `skillet show [path]` | Print the parsed specification and behavior coverage |

## `init`

```bash
skillet init [--no-prompt] [--json]
```

Interactive runs ask before writing user-scoped dotagents configuration. Use `--no-prompt` for an agent or script that already has permission to proceed.

## `new`

```bash
skillet new <name> [--path <dir>] [--json]
```

The default directory name is a slug derived from the skill name.

## `instructions`

```bash
skillet instructions <spec|skill|evals> [path] [--json]
```

The artifact and path may be given in either order. JSON output also includes filesystem-derived artifact state when a skill root is available.

## `eval`

```bash
skillet eval [path] [options]
```

| Option | Purpose |
|---|---|
| `--case <id>` | Run one case |
| `--behavior <id>` | Run cases covering one behavior |
| `--trials <n>` | Override trial count for every selected case |
| `--baseline` | Repeat trials without the skill and report lift |
| `--harness <name>` | Select `codex`, `claude`, or a model-qualified built-in |
| `--sandbox docker|none` | Override sandbox mode |
| `--dry` | Run deterministic checks without spawning an agent |
| `--out <dir>` | Persist per-case results and reuse them on rerun |
| `--report <file>` | Write a Vitest JSON report |
| `--keep-workspaces` | Keep temporary workspaces for debugging |
| `--verbose` | Print full transcripts for non-passing trials |

Exit code `0` means every selected skill trial passed. Exit code `1` means a trial failed or errored.

## Version

```bash
skillet --version
```
