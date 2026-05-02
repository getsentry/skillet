# Design

## What an eval looks like under the new contract

Two example shapes the generator emits, depending on whether the
skill produces structured output for the rule under test.

### Structured-output rule (e.g. severity calibration with a finding block)

```ts
import { expect } from "vitest";
import { describeEval, judge, skilletHarness, toolCalls } from "@sentry/skillet/evals";

const SeverityReasoningJudge = judge("SeverityReasoningJudge", async ({ criterion }) =>
  criterion("Justifies the severity by tying it to blast radius (release publish, secret scope, etc.)."));

describeEval(
  "calibrate-severity",
  { harness: skilletHarness({ skill: skillRoot }) },
  (it) => {
    it("calibrate-severity__release-publish-rce", async ({ run, behavior, harness }) => {
      behavior("calibrate-severity");
      await harness.setup("...");
      const result = await run("Audit .github/workflows/release.yml");

      // Structural — the skill emits a finding block we can parse
      expect(result.output).toMatchObject({
        severity: "HIGH",
        trigger: expect.stringMatching(/pull_request_target|workflow_run/),
      });
      // Tool calls also structural
      expect(toolCalls(result.session).map(c => c.name))
        .toEqual(expect.arrayContaining(["read_file"]));
      // One LLM-rubric judge for the explanation quality
      await expect(result).toSatisfyJudge(SeverityReasoningJudge);
    });
  },
);
```

### Free-form rule (e.g. pwn-request explanation in chat)

```ts
const IdentifiesPrivilegedTriggerJudge = judge("IdentifiesPrivilegedTriggerJudge", async ({ criterion }) =>
  criterion("Names pull_request_target or workflow_run as the privileged trigger."));

const ConnectsExploitChainJudge = judge("ConnectsExploitChainJudge", async ({ criterion }) =>
  criterion("Ties the trigger to execution of PR-controlled code with secrets available."));

const RatesHighSeverityJudge = judge("RatesHighSeverityJudge", async ({ criterion }) =>
  criterion("Rates the finding HIGH or CRITICAL."));

describeEval(
  "report-pwn-request",
  { harness: skilletHarness({ skill: skillRoot }) },
  (it) => {
    it("report-pwn-request__pr-target-checkout-build", async ({ run, behavior, harness }) => {
      behavior("report-pwn-request");
      await harness.setup("...");
      const result = await run("Audit .github/workflows/ci.yml");

      // Three narrow judges, each testing one property of the agent's reasoning
      await expect(result).toSatisfyJudge(IdentifiesPrivilegedTriggerJudge);
      await expect(result).toSatisfyJudge(ConnectsExploitChainJudge);
      await expect(result).toSatisfyJudge(RatesHighSeverityJudge);
    });
  },
);
```

Each judge fails independently with its own rationale in the
reporter. No regex on chat output — the agent can phrase the
finding however it wants as long as the judges agree it covered
each property.

## Banned assertion kinds

- `output-matches` — regex against `result.session.outputText`.
- `output-contains` — substring presence in
  `result.session.outputText`.
- `output-not-contains` — substring absence in
  `result.session.outputText`.

These kinds are removed from `Assertion`. The renderer rejects
any plan containing them with a `RenderError` that explains the
migration target:

> case "...": assertion kind "output-matches" is banned. Free-form
> agent output is not structurable enough for regex/string
> matching to be reliable. Replace with one of:
> - a named judge: `{ kind: "judge", judgeName: "..." }`
>   declared in `plan.judges` with a 1-property criterion
> - structural: `{ kind: "output-match-object", value: {...} }`
>   if the skill emits structured output
> - tool-call shape: `{ kind: "tool-calls", expected: {...} }`

## Updated Assertion type

```ts
export type Assertion =
  | OutputMatchObjectAssertion
  | ToolCallsAssertion
  | JudgeAssertion;
```

The three banned kinds are removed. `output-match-object`,
`tool-calls`, and `judge` remain.

## Updated CODE_EVAL_CONTRACT

The contract now leads with:

```text
## Code-eval contract

Eval files are code-evals. Assertions test the agent through one
of three first-class shapes:

1. **Structural** — `expect(result.output).toMatchObject({...})`
   when the skill emits a structured finding block (JSON or
   parseable shape) the eval can pin.
2. **Tool-call shape** —
   `expect(toolCalls(result.session).map(c => c.name)).toEqual([...])`
   for tool sequence and argument expectations.
3. **Named LLM-rubric judges** — declared via
   `judge("Name", async ({ criterion }) => criterion("…"))` and
   asserted with `await expect(result).toSatisfyJudge(NameJudge)`.
   Each judge tests one property. Multiple judges per case is
   normal and expected.

**Banned**: regex or substring matching against
`result.session.outputText` (the agent's free-form chat reply).
The agent paraphrases between runs; regex on free-form text is a
brittle proxy that fails or passes for the wrong reasons. If the
property is structurable, use the skill's structured output. If
it isn't, write a narrow named judge.

### Caps

1. **Multiple narrow judges encouraged.** Each judge tests ONE
   property. Per-file cap: ≤5 judges (more than that means
   you're not splitting properties cleanly).
2. **Judge criteria ≤ 200 characters.** Tight, one-property
   rubric — 1-2 sentences. Renderer accepts up to 300 chars.
3. **Banned assertion kinds**: `output-matches`,
   `output-contains`, `output-not-contains`.
4. **No declared-but-unreferenced judges.**

### Judge-first vs structural-first

Reach for structural (`output-match-object`, `tool-calls`) when
the skill emits a structured finding block — JSON, YAML,
key:value pairs the eval can parse. Reach for named LLM-rubric
judges when the deliverable is free-form text reasoning. Both
are first-class.
```

## Verifier prompt updates

The verifier mirrors the contract. Its checks become:

- ❌ Any banned assertion kind → return edit with a clear
  migration path. (Defense in depth — the renderer rejects
  these too, but verifier catches them earlier with a better
  error message before the renderer's fallback fires.)
- ❌ A judge whose criterion bundles multiple properties → return
  `split-judge` with the suggested narrower judges.
- ❌ A judge criterion over 200 chars → `shorten-criterion`.
- ❌ Per-file judge count > 5 → return drops/merges.
- ❌ Declared-but-unreferenced judges → `drop-judge`.
- ✅ Otherwise approve.

## New PlanEdit kinds

```ts
/** Split one broad judge into multiple narrower judges. */
export interface SplitJudgeEdit {
  kind: "split-judge";
  judgeName: string;          // existing judge to split
  replacements: JudgePlan[];  // new judges to declare in its place
  /** New judge names referenced by each case that referenced the old one,
   *  in order. Each case's `judge` assertion is replaced by judge assertions
   *  for every name in `caseAssignments`. */
  caseAssignments: string[];
}

/** Add a new judge declaration AND a `judge` assertion in named cases. */
export interface AddJudgeEdit {
  kind: "add-judge";
  judge: JudgePlan;
  /** Cases (by name) where the new judge is appended to assertions. */
  caseNames: string[];
}
```

`tighten-regex` is removed (no regex left to tighten).

## Renderer cap changes

```ts
// Drop:
//   - "≤1 judge per file"           → raise to ≤5
//   - "≥2 deterministic per judged case" → drop entirely
//
// Add:
//   - reject Assertion of banned kind, with migration message
//
// Keep:
//   - judge name regex (PascalCase ending in Judge)
//   - criterion ≤ 300 chars
//   - no unreferenced judges
//   - duplicate case-name rejection
//   - tests_behavior matches entry id
//   - case input non-empty
```

## Migration

Existing `.eval.ts` files using the banned kinds **keep running**
— the data-array `describeEval` overload still loads, vitest
still runs the file, and `expect(result.session.outputText).toMatch(...)`
is just a vitest matcher invocation that doesn't care about
skillet's contract. Skillet's contract applies to *what eval-gen
produces*, not what's already on disk.

Files generated under the new contract will look meaningfully
different from files generated under the prior contract. That's
the point — the new files lean into judges. Authors can
hand-edit the new files freely; nothing prevents them from
adding their own deterministic checks if they want.

## Cost

The new contract typically produces 2-3 narrow judges per case
where the prior contract produced 1 broad judge + 2-3 regex
checks. Net LLM cost at eval time goes up roughly 2-3× per case
because judges call the LLM and regex doesn't. The AI queue
already throttles, so wall-clock is bounded; cost on Anthropic
goes up proportionally.

We accept the cost: the prior version was cheap but tested the
wrong thing. A 3× cost increase on a 30-behavior eval suite is
~90 LLM calls vs ~30 — still cheap on the scale of running a
skill once.

## Risks

- **Verifier produces invalid `split-judge` edits.** Mitigation:
  applier validates the edit (replacements must be non-empty,
  caseAssignments names must reference real judges in
  replacements) and throws on invalid; eval-gen falls back to
  the original plan with a warning.
- **Generator over-judges trivial properties.** A case asking
  the agent to call one tool gets 5 judges, each one-line. Caps
  on judge count (≤5) and shared contract framing limit this;
  if it shows up in regen we tighten the prompt.
- **Authors prefer regex.** Some maintainers will hand-edit
  generated files to add `not.toContain("RCE")` checks. That's
  fine — vitest doesn't care, the contract only governs eval-gen
  output. The generated file is a starting point; durable hand
  edits stick.
