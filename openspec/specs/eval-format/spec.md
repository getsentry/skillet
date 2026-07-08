# Eval Format Specification

## Purpose

Eval cases are declarative YAML files under a skill's `evals/cases/`,
one case per file, linked to a spec.md behavior by slug. Checks assert
workspace artifacts (file_exists, shell) or semantic criteria (judge,
graded through the harness); regex/substring matching against
transcripts is deliberately unsupported — it tests the assertion's
grammar, not the agent's behavior. Cases are plain data humans write
and edit directly; skillet never generates or overwrites them.

## Requirements
### Requirement: Declarative YAML eval cases

Eval cases SHALL be YAML files in `evals/cases/`, one case per file. A case has required fields `behavior` (a behavior identifier from spec.md) and `prompt` (the user message given to the agent under test), and optional fields `fixture` (a slug under `evals/fixtures/`), `setup` (a shell script run in the workspace before the agent), `checks` (list of check entries), `trials` (default 1), and `timeout` (seconds, default 300).

#### Scenario: Minimal case
- **WHEN** a case file contains only `behavior:` and `prompt:` plus one check
- **THEN** it is valid and runs in a fresh empty workspace

#### Scenario: Case with fixture and setup
- **WHEN** a case declares `fixture: git-repo` and a `setup:` script
- **THEN** the fixture directory is copied into the workspace and the setup script runs there before the agent starts

### Requirement: Check types

The supported check types SHALL be: `file_exists: <path>` (path exists in the workspace after the run), `shell: <command>` (command run in the workspace; exit 0 passes), and `judge: <criterion>` (natural-language criterion graded through the harness). Checks against the raw transcript text via regex or substring are deliberately not supported.

#### Scenario: Shell check passes
- **WHEN** a case has `shell: "git log -1 --format=%s | grep -q '^feat:'"` and the agent produced such a commit
- **THEN** the check passes

#### Scenario: Deterministic checks run before judges
- **WHEN** a case has both shell checks and a judge check
- **THEN** shell and file checks run first, and the judge is invoked only if they all pass

### Requirement: Human-authorable and durable

Eval cases SHALL be plain data that humans can write and edit directly. Skillet SHALL never regenerate or overwrite existing case files; agents add cases guided by `skillet instructions evals`.

#### Scenario: Hand edits stick
- **WHEN** a user edits a case's prompt and re-runs any skillet command
- **THEN** the edited file is untouched by skillet

## Output layout

```
skills/<skill>/
├── SKILL.md                     ← skill body (skill-writer output)
├── spec.yaml                    ← source of truth
├── references/                  ← skill-writer output
│   └── <topic>.md
└── evals/
    ├── _judges.ts               ← canonical deduped judges
    ├── fixtures/                ← per-case workspace seeds
    │   └── <case-slug>/
    │       └── <rel-path>       ← real readable file
    └── <entry-id>.eval.ts       ← per-behavior eval, imports
                                   from _judges.js, calls
                                   harness.useFixture(<slug>)
```
