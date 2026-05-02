# Design

## Code-evals: Request → Generate → Verify

The deliverable is **code-evals**: `.eval.ts` files where most of
the assertion surface is real `expect(...)` calls against
deterministic shapes (regex with word boundaries, specific
substrings, tool-call sequences, output-object equality). Prose
belongs in the spec entry's `rationale` and the PR description, not
the test body. Judges exist for genuinely semantic checks; they are
the exception, not the default.

The eval-gen workflow makes that contract explicit at every step:

```
                    ┌──────────────┐
        spec entry  │   request    │  shared "code-eval contract" string
        ─────────▶  │              │  imported into both system prompts.
                    └──────┬───────┘  Tells the model: "you produce
                           │           code-evals; a critic will check."
                    ┌──────▼───────┐
                    │   generate   │  ← `submitAiJob("eval-gen:<id>")`
                    │              │    parse-retry up to 3x.
                    │              │    Returns AssertionPlan.
                    └──────┬───────┘
                           │  AssertionPlan
                    ┌──────▼───────┐
                    │   verify     │  ← `submitAiJob("eval-gen:verify:<id>")`
                    │              │    1 call, no retry loop.
                    │              │    Same contract as generator.
                    │              │    Returns approve | edits.
                    └──────┬───────┘
                           │  approve | { edits: PlanEdit[] }
                    ┌──────▼───────┐
                    │ apply edits  │  ← deterministic, in-process.
                    │ + render     │    Falls back to original plan
                    └──────────────┘    if edits invalidate it.
```

The "request" stage is not a separate LLM call — it's the **shared
contract string** imported into both system prompts. Telling the
model up-front what it's optimized for (code-evals) and what
specifically will be checked against (the named caps and bans) gets
better first-pass output than asking it cold. The same string is
the verifier's checklist, so generator and critic can't drift.

The verify stage answers exactly one question: *did the generator
honor the code-eval contract?* If yes, ship. If no, the critic
returns the specific contract violations as `PlanEdit[]` and skillet
applies them in-process. No iterative loop — single verify pass.

## Generator prompt updates

`buildEvalGenPrompt` (existing) opens with a **Code-eval contract**
block — imported from a shared string so the verifier sees the
same text:

```text
## Code-eval contract

You produce code-evals. The deliverable is `expect(...)` assertions
on deterministic shapes — regex with word boundaries, specific
substrings, tool-call sequences, output-object equality. Prose
belongs in the spec entry's rationale and the PR description, not
the test body.

A critic call will verify every plan you produce against this
contract. The critic will return EDITS if any of these are true:

- A case has only a `judge` assertion (every judged case must also
  have ≥2 deterministic checks).
- A judge `criterion` exceeds 200 characters.
- An `output-matches` pattern is a common English word without a
  domain anchor (`/vulnerable/i`, `/unsafe/i`, `/risk/i`,
  `/issue/i`, etc.).
- A check could be expressed deterministically (regex, contains,
  tool-call shape) but uses a judge anyway.
- More than one judge appears in a single file.

Plans that survive verify ship as-is. Plans that need edits cost
an extra LLM call and a re-render. Optimize for deterministic-
first; reach for a judge only when the rule is semantic and no
shape-based check could verify it.
```

The hard caps move out of free-form "Hard rules" prose and into a
numbered "Caps" section the model can pattern-match against. The
contract string is the same one the verifier reads; if a cap
changes, both prompts pick it up.

## Verify prompt and response

New file: `src/authoring/prompts/eval-gen-verify.ts`. The system
prompt embeds the **same code-eval contract string** the generator
saw — verbatim, imported from the shared module — so the critic
checks against exactly what the generator was told to produce.

```text
You are a critic checking that an eval plan honors the code-eval
contract.

[<shared code-eval contract string, identical to the generator's>]

You receive:

1. The spec entry the eval is for (id, statement, rationale).
2. The full must_not list from the same spec.
3. The candidate AssertionPlan the generator produced.

Your sole job: did the generator honor the contract above?

Return JSON:

{ "approve": true }    — contract honored, ship as-is

OR

{ "approve": false, "edits": [<PlanEdit>...] }    — specific
contract violations to fix

Approve if the plan tests the rule, every assertion is meaningful,
and the prose-to-code ratio respects the contract. Otherwise return
targeted edits from this list:

- drop-judge:                         { kind: "drop-judge", judgeName }
- replace-judge-with-deterministic:   { kind: "replace-judge-with-deterministic", judgeName, replacements: Assertion[] }
- tighten-regex:                      { kind: "tighten-regex", caseName, assertionIndex, pattern, flags? }
- shorten-criterion:                  { kind: "shorten-criterion", judgeName, criterion }
- add-deterministic:                  { kind: "add-deterministic", caseName, assertion }
- drop-assertion:                     { kind: "drop-assertion", caseName, assertionIndex }

Reject (return edits) if:
- A case has only a judge assertion. Replace with deterministic
  checks or add baseline `output-matches` for the rule's load-bearing
  keyword.
- A judge criterion is over 200 characters. Shorten it.
- A regex matches common English without domain context (e.g.
  `/vulnerable/i`, `/issue/i`). Tighten with word boundaries and
  alternation, or replace with a `output-contains` of a specific
  token.
- The plan tests *that the agent talked about the rule* but not
  *that it correctly identified the artifact*. Add a check that
  ties to the input fixture (a function name, a literal string,
  the YAML key under audit).
```

## PlanEdit applier

```ts
// src/authoring/phases/eval-gen-edits.ts (new)

export const applyPlanEdits = (
  plan: AssertionPlan,
  edits: PlanEdit[],
): AssertionPlan => {
  // Pure function. Applies edits in input order. Throws on
  // unknown edit kind, missing target case/judge name, or
  // out-of-range assertion index.
};

export type PlanEdit =
  | { kind: "drop-judge"; judgeName: string }
  | {
      kind: "replace-judge-with-deterministic";
      judgeName: string;
      replacements: Assertion[];
    }
  | {
      kind: "tighten-regex";
      caseName: string;
      assertionIndex: number;
      pattern: string;
      flags?: string;
    }
  | { kind: "shorten-criterion"; judgeName: string; criterion: string }
  | { kind: "add-deterministic"; caseName: string; assertion: Assertion }
  | { kind: "drop-assertion"; caseName: string; assertionIndex: number };
```

`drop-judge` removes the judge declaration AND every `judge`
assertion that referenced it. `replace-judge-with-deterministic`
removes the declaration and substitutes the replacements into
each case that referenced the judge. `add-deterministic` appends
to the case's assertions. Other edits are local mutations.

## Renderer hard caps (additions)

In `eval-gen-render.ts:validatePlan`:

```ts
const MAX_CRITERION_CHARS = 300;       // generator targets 200; renderer accepts ≤300
const COMMON_ENGLISH_WORDS = new Set([
  "vulnerable", "unsafe", "dangerous", "risk", "issue",
  "problem", "bug", "wrong", "bad", "broken",
]);

// Reject:
//  - case with only `judge` assertions
//  - judge with criterion > MAX_CRITERION_CHARS
//  - >1 judge per plan
//  - `output-contains`/`output-matches` whose value (or pattern,
//    with metacharacters stripped) is a single common English word
```

Each rejection bubbles as `RenderError` with a specific message so
the verifier's edit pass — or the generator's parse-retry — knows
what to fix.

## Phase wiring

`runEvalGen` per-entry flow becomes:

```ts
const plan = await generatePlan(...);          // current parse-retry loop
const verdict = await verifyPlan(plan, ...);   // 1 call, no retry
const finalPlan = verdict.approve
  ? plan
  : applyPlanEditsSafely(plan, verdict.edits, plan); // fall back to plan
const rendered = renderEvalFile(entry.id, finalPlan);
writeFileSync(filePath, rendered);
```

`applyPlanEditsSafely` wraps `applyPlanEdits` + `validatePlan` +
`renderEvalFile`; on any failure it returns the fallback (the
unedited plan) and logs a warning event so the user sees that
verify suggested edits but they didn't land.

## Cost

Per behavior: +1 LLM call. With concurrency 8, the warden regen
moves from ~96s → ~150s (verify call is ~half the size of a
generate call: no fixture YAML, just plan JSON).

## Risks

- **Verify gives bad edits.** Mitigation: `applyPlanEditsSafely`
  falls back to the original plan if edits invalidate it. The
  worst case is "verify did nothing, original plan ships."
- **Two prompts drift.** Generator and verifier share the same
  hard caps; mitigation: extract the caps into a single constant
  string both prompts import, so they stay in sync.
- **Edits cascade.** Applying multiple edits in order can produce
  states that earlier edits couldn't anticipate. Mitigation: edits
  are independent (each names its target case/judge). The applier
  rejects an edit whose target was removed by an earlier edit
  rather than silently accepting it.
- **Verifier conservatism.** A pessimistic verifier returns
  unnecessary edits and slows the loop. Acceptable — applying
  benign edits still ships a valid file. We catch over-correction
  in the warden regen smoke.

## Out of scope

- Iterative loops (generate → verify → re-generate → verify…).
  Single pass.
- A "gold-standard plan" library to seed the generator's examples.
  Belongs in a future change.
- Auto-rewriting existing on-disk `.eval.ts` files to the new
  caps. Only new generation goes through verify; existing files
  stay durable.
