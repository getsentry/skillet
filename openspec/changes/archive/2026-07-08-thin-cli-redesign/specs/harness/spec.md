# Harness Delta

## ADDED Requirements

### Requirement: Pluggable agent-CLI harness

Evals SHALL execute skills through a harness that spawns a real coding-agent CLI as a subprocess in the eval workspace. Skillet SHALL NOT implement its own agent loop or call LLM providers directly. Built-in harness adapters SHALL exist for Codex CLI (default) and Claude Code (`claude -p`).

#### Scenario: Default harness
- **WHEN** `skillet eval` runs with no harness configured
- **THEN** each case executes by spawning the Codex CLI non-interactively with the case prompt, working directory set to the case workspace

#### Scenario: Claude harness selected
- **WHEN** `.skillet.yaml` sets `harness: claude` or `skillet eval --harness claude` is passed
- **THEN** cases execute via `claude -p` instead

#### Scenario: Harness binary missing
- **WHEN** the selected harness CLI is not on PATH
- **THEN** `skillet eval` fails fast before running any case, naming the missing binary and how to install or switch harnesses

### Requirement: Custom harness via command template

Users SHALL be able to define a custom harness in `.skillet.yaml` as a command template with `{workspace}` and `{prompt}` placeholders, plus an optional skill-installation path template. Any CLI that accepts a prompt and operates in a directory can serve as a test harness.

#### Scenario: Custom template executes
- **WHEN** config defines `harness: { command: "myagent run --dir {workspace} {prompt}" }`
- **THEN** each eval case substitutes the placeholders and executes that command

#### Scenario: Template missing placeholder rejected
- **WHEN** a custom harness command template lacks the `{prompt}` placeholder
- **THEN** validation of the config fails with an error identifying the missing placeholder

### Requirement: Skill installation into the harness

Before running a case, the harness SHALL make the skill under test available to the spawned agent in the way that agent discovers skills (e.g. copying it into the workspace's agent skill directory). With `--baseline`, the same case also runs without the skill installed.

#### Scenario: Skill visible to agent under test
- **WHEN** an eval case runs against a skill
- **THEN** the spawned agent CLI can discover and load that skill's SKILL.md from its conventional skill location in the workspace

#### Scenario: Baseline run has no skill
- **WHEN** the same case runs as a baseline trial
- **THEN** the workspace contains no trace of the skill under test

### Requirement: Container sandbox mode

The system SHALL support an opt-in container sandbox: when activated via `skillet eval --sandbox docker` or `sandbox.enabled: true` in `.skillet.yaml`, every harness invocation — agent trials and judge gradings alike — runs inside a container with the trial workspace mounted, so the agent keeps full freedom inside the container while the host stays untouched. Direct (uncontained) execution remains the default and is documented as trusting the skill and evals being run.

#### Scenario: Wrapped execution
- **WHEN** `skillet eval --sandbox docker` runs a case
- **THEN** the harness CLI executes inside the configured image with the workspace mounted and working directory set to it, and checks still evaluate the workspace from the host

#### Scenario: Judges are contained too
- **WHEN** a judge check grades a case in sandbox mode
- **THEN** the judge invocation also runs inside the container

#### Scenario: Docker missing fails fast
- **WHEN** sandbox mode is active but the docker binary or the configured image is unavailable
- **THEN** `skillet eval` fails before running any case, naming what is missing and how to provide it

#### Scenario: Network can be disabled
- **WHEN** the sandbox config sets `network: false`
- **THEN** the container runs with networking disabled

### Requirement: Transcript capture

The harness SHALL capture the spawned agent's output (stdout/stderr) as a transcript, attach it to the case result, and enforce a per-case timeout (default 300 seconds, overridable per case).

#### Scenario: Transcript on failure
- **WHEN** a case fails any check
- **THEN** the case result includes the transcript so an agent can diagnose the failure

#### Scenario: Timeout enforced
- **WHEN** the spawned agent exceeds the case timeout
- **THEN** the process is killed, the case is marked errored with a timeout message, and remaining cases still run
