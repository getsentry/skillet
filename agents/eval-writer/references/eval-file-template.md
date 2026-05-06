# Eval File Template

The canonical TypeScript shape for `evals/<entry-id>.eval.ts`.
Match this exactly; the validator flags deviations.

## Header

Every file starts with the same banner and imports:

```ts
// ──────────────────────────────────────────────────────────
// Generated initially from spec.yaml; durable after that. Edit
// freely to refine prompts, setup, and assertions for this
// behavior. Add or remove behaviors via spec.yaml — skillet only
// regenerates eval files for behaviors that don't have one yet.
// ──────────────────────────────────────────────────────────
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { expect } from "vitest";
import {
  createWorkspace,
  describeEval,
  piAiHarness,
  skilletAgent,
  toolCalls,
} from "@sentry/skillet/evals";
import {
  // Import every judge this file references, in alphabetical order.
  ConnectsExploitChainJudge,
  IdentifiesPrivilegedTriggerJudge,
} from "./_judges.js";

const skillRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/evals$/, "");
```

**Always import `createWorkspace`** — every case allocates a
workspace, even when no fixture files are seeded (it returns
an empty tempdir, and the agent's tool runtime requires
`metadata.cwd` to function). Drop other imports if unused —
e.g. `toolCalls` only if the file has no tool-call assertions,
unused judges, etc.

## Suite shape

```ts
describeEval(
  "<spec-entry-id-verbatim>",
  {
    harness: piAiHarness({ agent: skilletAgent({ skillRoot }) }),
    judgeThreshold: 0.75,
  },
  (it) => {
    it(
      "<spec-entry-id>__<short-slug>",
      { timeout: 90_000 },
      async ({ run }) => {
        // … case body
      },
    );
  },
);
```

- `describeEval`'s first arg is the spec entry id, EXACT.
- `judgeThreshold: 0.75` is the default. Don't change unless
  there's a strong reason — if so, surface it in your terminal
  output for the user.
- One `describeEval` per file (one spec entry per file). Multiple
  cases inside the same `describeEval` are fine when the rule
  has natural variations to test.

## Case body — empty workspace (no fixture files)

Even when the case doesn't seed any files, `createWorkspace`
must be called so the agent has a working directory. The
agent's tool runtime requires `metadata.cwd` for every tool
call (`bash`, `read_file`, `list_files`, `grep`, `write_file`)
— omitting it makes every tool call throw, the agent never
gets past its first action, and the test fails for an
infrastructure reason that has nothing to do with the rule.

```ts
it(
  "capture-intent__vague-new-skill-request",
  { timeout: 90_000 },
  async ({ run }) => {
    const cwd = createWorkspace(skillRoot);
    const result = await run(
      "I want to make a skill for reviewing Terraform code for security issues.",
      { metadata: { cwd } },
    );

    const names = toolCalls(result.session).map((c) => c.name);
    expect(names).not.toContain("Bash");

    await expect(result).toSatisfyJudge(AsksIntentQuestionsJudge);
    await expect(result).toSatisfyJudge(DoesNotInvokeCLIPrematurelyJudge);
  },
);
```

Pass `createWorkspace(skillRoot)` (no slug) for an empty
tempdir; pass a slug only when a fixture is seeded under
`evals/fixtures/<slug>/`.

## Case body — with fixture

```ts
it(
  "flag-pwn-request__pr-target-checkout",
  { timeout: 120_000 },
  async ({ run }) => {
    const cwd = createWorkspace(skillRoot, "flag-pwn-request__pr-target-checkout");
    const result = await run(
      "Audit .github/workflows/ci.yml for security issues.",
      { metadata: { cwd } },
    );

    const calls = toolCalls(result.session);
    expect(calls).toContainEqual(
      expect.objectContaining({
        name: "read_file",
        arguments: expect.objectContaining({
          path: ".github/workflows/ci.yml",
        }),
      }),
    );

    await expect(result).toSatisfyJudge(ConnectsExploitChainJudge);
  },
);
```

## Case body — structural-first (skill emits a finding shape)

```ts
it(
  "flag-pwn-request__structured",
  { timeout: 120_000 },
  async ({ run }) => {
    const cwd = createWorkspace(skillRoot, "flag-pwn-request__structured");
    const result = await run(
      "Audit .github/workflows/ci.yml; output JSON.",
      { metadata: { cwd } },
    );

    expect(result.output).toMatchObject({
      severity: "HIGH",
      trigger: "pull_request_target",
    });

    await expect(result).toSatisfyJudge(ExploitChainExplanationJudge);
  },
);
```

## Case body — must_not

```ts
it(
  "no-numeric-id-injection__pr-number-in-comment",
  { timeout: 90_000 },
  async ({ run }) => {
    const cwd = createWorkspace(skillRoot);
    const result = await run(
      "Anything risky about ${{ github.event.pull_request.number }} used in the run command here?",
      { metadata: { cwd } },
    );

    await expect(result).toSatisfyJudge(NoFalsePositiveOnNumericIdJudge);
    await expect(result).toSatisfyJudge(ExplainsSafeResolvedValueJudge);
  },
);
```

Must_nots get judges too — one for "did NOT do the wrong
thing" and one for "DID emit the right neutral framing."

## Number of cases per file

Default: **one case per spec entry.** Emit two or three only
when the rule has natural variations worth testing separately
(positive trigger + tricky boundary, different severity tiers,
positive + must-not-false-positive cousin).

Don't pad a one-rule entry with three cases that test the
same property different ways — that just multiplies LLM-call
cost at test time without proving anything new.

## Timeout values

- `90_000` ms (90s) — default for prompt-only cases.
- `120_000` ms (120s) — workspace-fixture cases (more tool
  calls, more model latency).
- Longer timeouts (150_000+) — only when the rule genuinely
  requires a long agent loop. The default (5s) from vitest 4
  is too short, so always specify.

## Imports — what NOT to add

The validator flags imports outside this set:

- `vitest` — `expect`
- `node:url`, `node:path` — for `skillRoot` resolution
- `@sentry/skillet/evals` — `describeEval`, `piAiHarness`,
  `skilletAgent`, `criterionJudge`, `createWorkspace`,
  `toolCalls`, type re-exports
- `./_judges.js` — judges declared in this skill's
  `_judges.ts`

Don't import from `@anthropic-ai/sdk`, `axios`, `fs`, or any
other module. The eval is a thin orchestration layer over the
harness — there's nothing to reach for outside the listed
imports.
