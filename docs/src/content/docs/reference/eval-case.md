---
title: Eval Case YAML
description: Reference for files under evals/cases.
type: reference
summary: Each case links to one spec behavior or constraint and contains a realistic prompt plus one or more checks.
---

Store one case per file under `evals/cases/`.

```yaml
behavior: branch-safety
prompt: |
  Commit the staged change.
setup: |
  git init -q -b main
  git config user.email eval@example.com
  git config user.name "Skillet Eval"
  printf 'export const base = 0;\n' > base.ts
  git add base.ts
  git commit -qm seed
  printf 'export const value = 1;\n' > value.ts
  git add value.ts
checks:
  - shell: >-
      test "$(git rev-parse main)" = "$(git rev-list --max-parents=0 HEAD)"
  - shell: test "$(git branch --show-current)" != main
  - shell: test "$(git rev-parse HEAD)" != "$(git rev-parse main)"
trials: 3
timeout: 300
```

## Fields

### `behavior`

Required. The slug of a behavior or constraint from `spec.md`.

Behavior slugs derive from headings:

```markdown
### Behavior: Conventional subject
```

becomes:

```yaml
behavior: conventional-subject
```

### `prompt`

Required. The user message sent to the agent under test.

Use a realistic request. Do not mention the skill, quote its instructions, or name an implementation detail merely to make the case pass.

### `fixture`

Optional. The slug of a directory under `evals/fixtures/`.

Skillet copies the fixture contents into a fresh temporary workspace before setup runs.

### `setup`

Optional shell script run inside the workspace before the agent starts. Setup has a 30-second timeout.

Use fixtures for committed starting files and setup for cheap dynamic state such as Git initialization or timestamps.

### `checks`

Required non-empty list.

#### `file_exists`

Passes when the path exists in the workspace after the agent finishes.

```yaml
- file_exists: src/client.ts
```

#### `shell`

Runs a shell command in the workspace. Exit code `0` passes.

```yaml
- shell: npm test
```

Use shell checks only when they directly prove the required result.

#### `judge`

Grades a semantic criterion through the configured harness. The judge receives the case prompt, transcript, and a bounded description of the resulting workspace.

```yaml
- judge: The implementation keeps business logic out of the transport handler.
```

Judges run only after all deterministic checks pass. One complete judge criterion per case is usually enough.

### `trials`

Optional positive integer. Defaults to `1`. Use repeated trials for behavior that has shown variance.

The CLI `--trials` option overrides case values.

### `timeout`

Optional positive number of seconds for the agent invocation. Defaults to `300`.

## Fixtures

```text
evals/
  cases/
    conventional-subject.yaml
  fixtures/
    git-repo/
      package.json
      src/
```

Validation fails when a case references a missing fixture.
