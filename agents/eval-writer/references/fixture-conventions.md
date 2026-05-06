# Fixture Conventions

When a case needs the agent under test to interact with files
in a workspace (read a script, audit a YAML, list a directory),
seed those files via fixtures. Skillet copies them into a
per-test tempdir and registers cleanup automatically.

## Directory layout

```
evals/
├── fixtures/
│   └── <case-slug>/
│       ├── .github/
│       │   └── workflows/
│       │       └── ci.yml
│       └── scripts/
│           └── run.sh
├── _judges.ts
└── flag-pwn-request.eval.ts
```

The `<case-slug>` is the FULL case name from your `it("…", …)`
block, e.g. `flag-pwn-request__pr-target-checkout`. One
fixtures directory per case keeps cases independent — a fixture
change for one case doesn't ripple into others.

## Eval-side usage

```ts
import {
  createWorkspace,
  describeEval,
  piAiHarness,
  skilletAgent,
} from "@sentry/skillet/evals";

it(
  "flag-pwn-request__pr-target-checkout",
  { timeout: 120_000 },
  async ({ run }) => {
    const cwd = createWorkspace(skillRoot, "flag-pwn-request__pr-target-checkout");
    const result = await run(
      "Audit .github/workflows/ci.yml for security issues.",
      { metadata: { cwd } },
    );

    // assertions …
  },
);
```

`createWorkspace(skillRoot, slug)`:
- Copies `evals/fixtures/<slug>/` into a fresh tempdir.
- Registers cleanup via vitest's `onTestFinished`.
- Returns the tempdir path.

Pass that path through `metadata: { cwd }` to `run(...)`. The
agent under test will see those files at its workspace root.

## When NOT to seed fixture *files*

When the case is purely a chat-style prompt with no workspace
interaction expected, don't seed any files in the fixture
directory. But you **still** call `createWorkspace(skillRoot)`
in the test body and pass `metadata: { cwd }` — the agent's
tool runtime requires `metadata.cwd` for every tool call.
Empty workspaces are fine; missing `metadata.cwd` is not.

## Workspaces that need shell bootstrap (`_setup.sh`)

Some skills need workspace state that doesn't copy cleanly via
file-tree seeding. The canonical example is a **`commit` skill
needing a real `.git/` directory with staged changes** —
`.git/` internals (object store, locks, file modes) don't
survive `cpSync` reliably, and an agent that runs `git status`
against an uninitialized directory has nothing to commit.

For these cases, drop a `_setup.sh` script in the fixture
root. The harness:

1. Copies fixture contents EXCEPT `_setup.sh` into the
   workspace tempdir.
2. Runs `_setup.sh` from a separate location with `cwd` set
   to the workspace tempdir, 30-second timeout.
3. Hands the workspace path to the agent via `metadata.cwd`.

Because `_setup.sh` never enters the workspace, a `git add .`
inside the script can't accidentally stage it, and the agent
never sees the script — only the state it produced.

### The post-setup state MUST reflect the test scenario

This is the most common mistake: the script runs `git init`,
commits everything, and exits — leaving a clean working tree.
The agent then runs `git status`, sees nothing to commit, and
the test fails for an obvious reason. **The script must
finish with the workspace in the exact state the prompt
implies.**

Decide first: what does the agent see when it runs
`git status` at the start of the test? Then write the script
to leave that state.

| Test scenario | Post-setup state | Pattern |
|---------------|------------------|---------|
| Agent commits a fix the user describes | One staged change matching the fix | initial commit baseline → modify file → `git add` the fix |
| Agent refuses empty/WIP commits | Nothing staged, working tree clean | initial commit baseline → stop |
| Agent reviews unstaged work | Modified files, none staged | initial commit baseline → modify → don't add |
| Agent splits unrelated changes | Multiple staged changes spanning unrelated areas | initial commit → modify file A and file B → `git add` both |
| Agent handles hook failure | One staged change + a failing pre-commit hook | initial commit baseline → modify → add → write executable `.git/hooks/pre-commit` that exits non-zero |

### Worked examples

**Agent commits a new fix** (canonical pattern — distinct
pre-fix and post-fix content, feature branch):

```sh
#!/bin/sh
set -e
git init -q
git config user.email "test@example.com"
git config user.name "test"

# Pre-fix file content.
mkdir -p src/auth
cat > src/auth/session.py << 'EOF'
def validate_session(token):
    session = cache.get(token)
    if session.is_expired():  # bug: NPE if session is None
        return None
    return session
EOF
git add .
git commit -q -m "initial"

# Move off the default branch so a 'no-commit-to-main' rule
# doesn't sidetrack the test.
git checkout -q -b fix/session-null-check

# Apply the fix the prompt implies — DIFFERENT content.
cat > src/auth/session.py << 'EOF'
def validate_session(token):
    session = cache.get(token)
    if session and not session.is_expired():
        return session
    return None
EOF
git add src/auth/session.py
```

After setup: one staged modification of `src/auth/session.py`
showing the null-check fix. `git status` shows it; the agent
inspects the diff, composes a commit message, runs
`git commit`.

**Agent refuses empty commit**:

```sh
#!/bin/sh
set -e
git init -q
git config user.email "test@example.com"
git config user.name "test"
git commit -q --allow-empty -m "initial"
# Stop here. Nothing staged, nothing modified.
```

After setup: clean working tree, agent has nothing to commit
and refuses.

### Pitfalls

- **Don't `cat >` overwrite a fixture-seeded file with the
  same content.** The fixture seeds version A; the script
  overwrites with version A; `git add` stages nothing. Either
  put pre-fix content in the fixture and post-fix in the
  script, OR don't seed that file at fixture level at all
  and let the script create it after the initial commit.
- **Don't `git add .` if the staged set should exclude
  something.** Use explicit paths: `git add src/auth/session.py`.
- **Don't reference `_setup.sh` from inside the script.** The
  script runs from outside the workspace; it isn't on disk
  inside `cwd` and never will be. Inside the script, treat the
  workspace as if `_setup.sh` doesn't exist.
- **Don't leave the workspace on `main`/`master`.** Read the
  spec's must_not list — if the skill under test refuses to
  operate on the default branch (a common safety rule for
  commit/branch/PR skills), every test fixture that targets
  a different rule will get sidetracked into that warning.
  Default to a feature branch:
  `git checkout -b feature/test-branch` (or whatever name
  the test scenario implies) after the initial commit.
  Cases that test the must-not rule itself stay on `main`
  on purpose.

Use this pattern only when the rule under test genuinely
requires a non-trivial workspace state. Tight, focused setups
— don't materialize entire mock projects.

## File contents

- Use real, plausible content. The agent under test will read
  and reason about it.
- Keep files tight — long fixtures bloat the eval suite.
- For YAML/JSON workflows, a 10-30 line example usually
  suffices. The agent doesn't need a full project to flag a
  pattern.
- Exception: when the rule is "agent considers context across
  multiple files", include the contextual files at minimum
  realistic size.

## No `before` / `after` test hooks

There is no `before`/`after` field on the eval suite for shell
commands. Workspace bootstrap goes in `_setup.sh` inside the
fixture (see "Workspaces that need shell bootstrap" above);
post-test work isn't supported and shouldn't be needed —
workspaces are tempdirs and get cleaned up automatically.

## Must_not awareness

A fixture for a positive case must NOT accidentally trip a
different `must_not` rule from the same spec. Read the full
`spec.must_not[]` list before crafting a fixture; if your
fixture would trip another rule, that's a confound — pick a
different fixture or split the test.

## File-write convention

Use `write_file` for each fixture path. Skillet's runner
auto-creates parent directories — you don't need a separate
`mkdir`-style call.

```
write_file path=evals/fixtures/flag-pwn-request__pr-target-checkout/.github/workflows/ci.yml content="…"
write_file path=evals/fixtures/flag-pwn-request__pr-target-checkout/scripts/run.sh content="…"
```

One call per file. Skip fixture files that are already on
disk and unchanged from a previous pass — the validator flags
unnecessary churn.
