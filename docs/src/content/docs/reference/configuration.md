---
title: .skillet.yaml
description: Configure the default eval harness and Docker sandbox.
type: reference
summary: Skillet loads the nearest configuration file by walking up from the skill directory.
---

Skillet searches for `.skillet.yaml` from the skill directory upward. CLI flags override file settings.

## Built-In Harness

```yaml
harness: codex
effort: medium
concurrency: 4
```

Select a model with a suffix:

```yaml
harness: claude:sonnet
```

Supported built-ins are `codex` and `claude`.

| Field | Default | Description |
|---|---|---|
| `harness` | `codex` | Built-in, model-qualified built-in, or custom harness mapping |
| `effort` | `medium` | Built-in reasoning effort: `low`, `medium`, `high`, or `xhigh` |
| `concurrency` | `4` | Parallel trials or variants within one case, from `1` through `8` |

Skillet leaves the model unset unless `harness` includes a model suffix. The
selected agent CLI's configured/default model therefore remains in control.

## Custom Harness

```yaml
harness:
  name: my-agent
  command: "my-agent run --dir {workspace} {prompt}"
  skill_dir: "{workspace}/.my-agent/skills"
```

| Field | Required | Description |
|---|---|---|
| `name` | No | Display name; defaults to `custom` |
| `command` | Yes | Command template containing `{workspace}` and `{prompt}` |
| `skill_dir` | No | Template for the directory where Skillet installs the skill |

Custom harnesses must be configured in the file. `--harness` accepts built-in names only.
Custom harnesses own their model and cost flags; `effort` is rejected with a custom command.

## Docker Sandbox

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

| Field | Default | Description |
|---|---|---|
| `enabled` | `false` | Run harness and judge processes in Docker |
| `image` | `skillet-eval` | Local Docker image name |
| `mount_auth` | Existing standard agent paths | Host files or directories mounted under container root home |
| `network` | `true` | Set `false` to use Docker's `none` network |
| `env` | `[]` | Host environment variable names passed through to Docker |

CLI overrides:

```bash
skillet eval --sandbox docker
skillet eval --sandbox none
```

## Complete Example

```yaml
harness: codex
effort: medium
concurrency: 4

sandbox:
  enabled: true
  image: skillet-eval
  mount_auth:
    - ~/.codex
  network: true
```

Invalid YAML or incorrectly typed fields stop the eval before any case runs.
