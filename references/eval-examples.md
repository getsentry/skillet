# Eval Case Examples

## Format

Eval files live in `evals/` and use the `.eval.yaml` extension.
Each file has a top-level `evals` array of cases.

## Basic Structure

```yaml
evals:
  - name: descriptive name of what this tests
    turns:
      - "The prompt sent to the agent"
    checks:
      - run: "cat output.txt"
        contains: "expected content"
```

## Case Fields

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| name | yes | — | Human-readable test name |
| turns | yes | — | Array of user messages sent in sequence |
| workspace | no | empty tmpdir | Setup script or existing directory |
| checks | no | — | Structural assertions on workspace or output |
| criteria | no | — | Natural language criteria for LLM judge |
| threshold | no | 0.75 | Minimum judge score (0.0–1.0) |
| timeout | no | 120000 | Max milliseconds for agent execution |
| requires | no | — | Prerequisites (env vars or commands) |

## Workspace Modes

### Empty (default)
No workspace config — agent gets a fresh empty temp directory.

```yaml
evals:
  - name: creates files from scratch
    turns:
      - "Create a hello.py that prints Hello World"
    checks:
      - run: "python hello.py"
        contains: "Hello World"
```

### Setup Script
Runs a shell script to prepare the workspace before the agent starts.

```yaml
evals:
  - name: modifies existing code
    workspace:
      setup: |
        echo 'print("old")' > main.py
    turns:
      - "Change main.py to print 'new' instead of 'old'"
    checks:
      - run: "python main.py"
        equals: "new"
```

### Existing Directory
Uses an existing directory. Supports environment variable expansion.

```yaml
evals:
  - name: works with real project
    workspace:
      cwd: "$HOME/projects/my-app"
    requires:
      - env: HOME
    turns:
      - "List the top-level files"
    checks:
      - output_contains: "package.json"
```

## Check Types

### Shell command checks
Run a command in the workspace and assert on its output:

```yaml
checks:
  # Regex match
  - run: "cat output.txt"
    matches: "\\d+ items processed"

  # Contains substring
  - run: "cat output.txt"
    contains: "success"

  # Does not contain
  - run: "cat output.txt"
    not_contains: "error"

  # Exact equality
  - run: "echo hello"
    equals: "hello"

  # Exit code
  - run: "python -c 'import mymodule'"
    exits: 0
```

### Output checks
Assert directly on the agent's text output (no shell command):

```yaml
checks:
  # Agent output contains
  - output_contains: "I created the file"

  # Agent output does not contain
  - output_not_contains: "error"

  # Agent output matches regex
  - output_matches: "created \\d+ files"
```

## LLM Judge

Use `criteria` for subjective quality evaluation. The judge grades A–E.

```yaml
evals:
  - name: produces good documentation
    turns:
      - "Write documentation for the User model"
    criteria: |
      The documentation should:
      - Cover all public methods
      - Include usage examples
      - Follow a consistent format
      - Be accurate to the code
    threshold: 0.75
```

## Requirements

Skip cases that need specific environment:

```yaml
evals:
  - name: uses GitHub API
    requires:
      - env: GITHUB_TOKEN
      - command: gh
    turns:
      - "List open issues"
```

## Multi-turn Conversations

```yaml
evals:
  - name: handles follow-up
    turns:
      - "Create a Python function that adds two numbers"
      - "Now add type hints to the function"
    checks:
      - run: "grep 'def add' main.py"
        matches: "int.*int.*->.*int"
```

## Eval Design Tips

1. **Test behavior, not implementation** — check what the agent produces,
   not how it produces it
2. **One concept per case** — each eval should test one specific capability
3. **Deterministic checks first** — use structural checks for things that
   must be exact; use the judge for subjective quality
4. **Fast feedback** — keep timeouts reasonable, use setup scripts to
   minimize agent work on fixture creation
5. **Cover failure modes** — include cases where the agent should refuse,
   ask for clarification, or handle errors gracefully
