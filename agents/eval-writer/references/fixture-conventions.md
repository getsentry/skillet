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

1. Copies the whole fixture (including `_setup.sh`) into a
   tempdir.
2. Runs `_setup.sh` with `cwd` set to the tempdir, 30-second
   timeout.
3. Removes `_setup.sh` so the agent only sees the seeded files
   plus whatever the script produced.
4. Hands the workspace path to the agent via `metadata.cwd`.

Example for a `commit` eval:

```
evals/fixtures/include-issue-reference__with-issue/
├── _setup.sh
└── src/
    └── auth/
        └── session.py
```

`_setup.sh`:

```sh
#!/bin/sh
set -e
git init -q
git config user.email "test@example.com"
git config user.name "test"
git add .
```

After setup, the workspace has:
- A real `.git/` directory.
- The seeded files staged.
- `_setup.sh` removed.

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
