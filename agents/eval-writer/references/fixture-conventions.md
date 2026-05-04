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

## When NOT to seed a fixture

When the case is purely a chat-style prompt with no workspace
interaction expected, don't seed anything. `run(input)` runs
the agent against an empty workspace. Adding an unused fixture
is dead weight.

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

## No shell setup field

There is no `setup`, `before`, or `after` field for shell
commands. If you need shell-side preparation (download a
dependency, generate a key), prefer materializing the
resulting files into the fixture directly.

If you genuinely need runtime shell execution before `run()`,
that's a sign the test is too integration-heavy for the
unit-eval shape. Surface it as a suggestion in your terminal
output.

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
