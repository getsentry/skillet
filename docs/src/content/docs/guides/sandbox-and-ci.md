---
title: Sandbox and CI
description: Isolate untrusted evals and run repeatable validation in continuous integration.
type: tutorial
summary: Direct execution is the trusted default; Docker contains agent and judge processes for untrusted skills.
---

Skillet runs agent CLIs directly on the host by default. Trial workspaces are temporary, but the agent process itself has full machine access.

Use direct execution only for skills and eval cases you trust.

## Build the Sandbox Image

The Skillet repository includes a Docker image recipe. Clone the repository and run this command from its root:

```bash
docker build -t skillet-eval sandbox/
```

Run an eval in the container:

```bash
skillet eval --sandbox docker
```

Only agent and judge invocations run inside Docker. Case `setup` scripts and `shell` checks still run on the host against the mounted workspace. Treat eval case YAML as trusted input; Docker does not isolate malicious setup or check commands.

## Configure Sandbox Defaults

```yaml
sandbox:
  enabled: true
  image: skillet-eval
  mount_auth:
    - ~/.codex
    - ~/.claude
    - ~/.claude.json
  network: true
  env:
    - ANTHROPIC_API_KEY
```

Use `--sandbox none` to override an enabled project configuration for one run.

## Authentication on macOS

Claude Code can store OAuth credentials in macOS Keychain, which cannot be mounted into Docker. Use Codex in the sandbox or provide `ANTHROPIC_API_KEY` through the configured environment list.

## CI Validation

Run the mechanical checks first:

```bash
skillet validate
skillet eval --dry
```

Full evals require an authenticated harness and can consume model usage. Keep them in a dedicated CI job with explicit credentials, timeouts, and artifact retention.

Generate a report for review:

```bash
skillet eval --trials 3 --baseline --report results.json
```

Open it locally with:

```bash
npx vitest-evals serve results.json
```

Do not run eval cases you do not trust on a shared CI runner. Docker contains the agent process, not the case's setup and shell commands.
