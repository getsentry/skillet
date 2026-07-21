---
title: Sandbox and CI
description: Isolate untrusted evals and run repeatable validation in continuous integration.
type: tutorial
summary: Direct execution is the trusted default; Docker contains agent and judge processes for untrusted skills.
---

Skillet runs agent CLIs directly on the host by default. Trial workspaces are temporary, but the agent process itself has full machine access.

Use direct execution only for skills and eval cases you trust.

## Build the Sandbox Image

The repository includes a Docker image recipe:

```bash
docker build -t skillet-eval sandbox/
```

Run an eval in the container:

```bash
skillet eval --sandbox docker
```

Agent and judge invocations run inside Docker with the trial workspace mounted at `/workspace`. Deterministic checks still inspect the mounted workspace from the host.

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

Do not run untrusted skill evals directly on a shared CI runner.
