# Design

## File shape: before / after

### Before (today, data-array form)

```ts
describeEval("report-pwn-request", {
  data: [
    {
      name: "report-pwn-request__checkout-pr-head-build",
      tests_behavior: "report-pwn-request",
      input: "Please review this workflow:\n```yaml\n...```",
      criteria: "The response must identify this as a pwn-request
        vulnerability. It should explicitly call out that
        pull_request_target runs in a privileged context with access
        to secrets...",
    },
  ],
  harness: skilletHarness({ skill: skillRoot }),
  judges: [SubstringJudge(), CriterionJudge()],
  threshold: 0.75,
});
```

### After (target, callback form)

```ts
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { expect } from "vitest";
import {
  describeEval,
  judge,
  skilletHarness,
  toolCalls,
} from "@sentry/skillet/evals";

const skillRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/evals$/, "");

const PwnRequestJudge = judge("PwnRequestJudge", async (opts) => {
  // Single, named, reusable rubric scoped to this behavior.
  // Body is the criterion that used to live in case data.
  return opts.criterion(
    `The response identifies this as a pwn-request vulnerability and
     ties the privileged trigger (pull_request_target / workflow_run)
     to execution of attacker-controlled code in a context that has
     secrets and write tokens. A generic 'pin actions' note does not
     satisfy the rubric.`,
  );
});

describeEval(
  "report-pwn-request",
  { harness: skilletHarness({ skill: skillRoot }) },
  (it) => {
    it(
      "checkout-pr-head-build",
      { timeout: 180_000 },
      async ({ run, behavior }) => {
        behavior("report-pwn-request");
        const result = await run(
          "Please review this workflow:\n```yaml\n...```",
        );

        // Deterministic: the report mentions pull_request_target
        expect(result.session.outputText).toMatch(/pull_request_target/i);

        // Deterministic: severity is rendered (any of the canonical tags)
        expect(result.session.outputText).toMatch(/\b(HIGH|CRITICAL)\b/);

        // Subjective: the rubric requires actually connecting the dots
        await expect(result).toSatisfyJudge(PwnRequestJudge);
      },
    );
  },
);
```

The key shift: the deterministic checks (vulnerability tag, severity
keyword) live in code where a reader sees them; the actual
*reasoning quality* check stays an LLM judge — but it's *named*,
reusable across the file's cases, and the rubric is plain text, not
prose-buried-in-data.

## Assertion plan (eval-gen LLM contract)

The eval-gen LLM no longer emits TS. It emits a JSON plan per spec
entry; skillet renders the TS file from the plan. Same parse-retry
loop, same diagnostics, no risk of TS syntax errors going to disk.

```ts
type AssertionPlan = {
  cases: CasePlan[];
  // 0–N named judges declared at file scope. Cases reference by name.
  judges: JudgePlan[];
};

type CasePlan = {
  name: string;        // <entry-id>__<short-slug>
  tests_behavior: string;
  input: string;
  setup?: string;      // shell script run before run(); preflighted
  timeout?: number;    // ms
  assertions: Assertion[];
};

type Assertion =
  // Deterministic — render to expect(...)
  | { kind: "output-matches"; pattern: string; flags?: string }       // regex
  | { kind: "output-contains"; value: string }                         // substring
  | { kind: "output-not-contains"; value: string }
  | { kind: "output-match-object"; value: JsonValue }                  // toMatchObject
  | { kind: "tool-calls"; expected: ToolCallExpectation }              // names / args
  // LLM-judged — render to await expect(result).toSatisfyJudge(JudgeName)
  | { kind: "judge"; judgeName: string };

type ToolCallExpectation =
  | { type: "names-equal"; names: string[] }       // exact ordered list
  | { type: "names-include"; names: string[] }     // present, any order
  | { type: "names-exclude"; names: string[] };

type JudgePlan = {
  name: string;        // PascalCase, ends in "Judge"
  criterion: string;   // plain-text rubric body
};
```

The renderer (`src/authoring/phases/eval-gen-render.ts`, new):
- Emits the import block, `skillRoot` derivation.
- Emits one `const FooJudge = judge("FooJudge", ...)` per `JudgePlan`.
- Emits the `describeEval(id, { harness }, (it) => { ... })` block
  with one `it()` per `CasePlan`.
- Maps each `Assertion` to its TS form. Unknown kinds = render-time
  error (caught, surfaces as a parse-fail-equivalent in eval-gen).

## Prompt redesign (eval-gen)

`buildEvalGenPrompt()` is rewritten to teach the LLM:
- **Default to deterministic**: prefer `output-matches`,
  `output-contains`, `tool-calls` over judges. Use a judge only when
  the assertion is genuinely semantic (correct *reasoning*, not
  presence of a keyword).
- **One judge per behavior, named for the behavior**, not per case.
  All cases under `report-pwn-request` reuse `PwnRequestJudge`.
- **Pin the right substring/regex**: keywords that the agent's
  output MUST contain to demonstrate it understood the rule. E.g.
  for severity calibration: `/\b(HIGH|MEDIUM|LOW)\b/`.
- **Keep the rubric short**: 2–4 sentences, in the judge body, not
  per case.
- **Negative cases (must_not / exclude-non-findings)**: prefer
  `output-not-contains` of the false-finding marker phrase, plus a
  judge that confirms no severity/finding was issued. Substring
  alone is unsafe — agents echo input tokens.

The prompt ships with two worked examples (one positive, one
must_not) showing the JSON plan inline.

## Local mini-lib changes

`src/vitest-evals/describe-eval.ts`:
- Add an overload accepting `(name, opts, body: (it) => void)`.
  Existing data-array signature stays.
- The callback form sets up `describe.concurrent`, then calls
  `body(it)` where `it` is a wrapper that:
  - Accepts an optional 2nd-arg options bag (`{ timeout }`).
  - Provides a context fixture: `{ run, behavior, harness }`.
    `run(input, opts?)` calls the harness; `behavior(id)` writes
    `task.meta.tests_behavior = id`.
- Preserves existing meta channels: `task.meta.harness.run` (full
  HarnessRun), `task.meta.eval.scores` for backward compat.

`src/vitest-evals/judges.ts`:
- Drop `CriterionJudge()` and `SubstringJudge()` exports.
- Add `judge(name, fn)` factory that returns a tagged JudgeFn.
- Add `toSatisfyJudge(judgeFn)` matcher registered via
  `expect.extend` at module load. The matcher accepts a
  `HarnessRun` (or any value with a `session`/`output` shape) and
  invokes `judgeFn` with `{ output, run, criterion(text) }`. Score
  ≥ threshold (default 0.75, configurable per matcher call) →
  matcher passes; else fails with a helpful diff.
- Internal `criterion(text)` helper uses the existing
  `runJudge(model, transcript, text, artifacts)` from
  `src/eval/judge.ts` so the LLM judge call path is unchanged.

`src/harness/index.ts` (`skilletHarness`):
- `run(input, opts?)` API stays. Adds `setup(script)` on the
  harness context for cases that seed the workspace inside the test
  body (so `setup` doesn't have to live on case data).
- Default workspace is the existing temp-dir behavior; calling
  `await harness.setup(script)` re-seeds it before the agent runs.

## Reporter mapping (`src/eval/vitest-runner.ts`)

The runner reads:
- `task.meta.harness.run` for session/usage (unchanged).
- `task.meta.tests_behavior` for spec mapping (unchanged path,
  populated by `behavior(id)` helper instead of being read from
  case data).
- `task.meta.eval.scores` is no longer the only source. Judges
  invoked via `toSatisfyJudge` push their named result to
  `task.meta.judges = [{ name, score, rationale }]`. The runner
  picks the primary judge as before (first non-null score; named
  judge preferred over anonymous).

If a test's only failure is `toSatisfyJudge`, vitest reports the
matcher's error; the reporter exposes the rationale via
`failureMessages` and the case-result's `judge` field. No new error
classes — vitest's standard assertion plumbing handles it.

## Migration

- Existing `.eval.ts` files using the data-array form keep working
  via the compat overload. Skillet does NOT regenerate eval files
  for behaviors that already have a file (existing rule preserved).
- Self-test fixtures in skillet's repo are rewritten in the new
  shape as part of this change.
- `getsentry/warden-skills` files are NOT touched in this repo;
  warden-skills authors regenerate or hand-edit on their schedule.
- `CriterionJudge` / `SubstringJudge` removal is the only public-
  surface break. They're only imported by skillet-generated files
  (compat path) and any user file that copy-pasted them. The compat
  describeEval path keeps `judges: [Substring..., Criterion...]`
  working by routing those names to internal shims for one release.
  Removed in the next minor.

## Risks

- **Wrong assertion choice.** LLM picks a flaky regex (`/HIGH/`
  matches "HIGHEST"), or routes a check to a judge that should be
  deterministic. Mitigations:
  - Renderer rejects suspicious patterns (anchored single-token
    regex without word boundaries → reject + retry).
  - Prompt examples show `\b(HIGH|MEDIUM|LOW)\b` not `/HIGH/`.
  - Eval-of-evals: when this lands, run the new generator against
    `warden-skills` corpus (manual test per release plan); if
    >10% of new cases use a judge where a deterministic check
    would suffice, tighten the prompt.
- **Compat path subtle drift.** Old data-array files don't pick up
  the new behavior helpers. Acceptable — they keep working as-is.
- **Local matcher registration.** `expect.extend` runs at module
  load; needs to fire before any test file imports. We register
  inside `src/vitest-evals/index.ts`, which generated files always
  import.

## Out of scope

- Replay / record fixtures — defer until upstream 0.9.
- `StructuredOutputJudge`/`ToolCallJudge` ports — the assertion-
  plan kinds (`output-match-object`, `tool-calls`) cover today's
  needs without dragging more upstream surface in.
