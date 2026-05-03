/**
 * System prompt for the eval-gen verify pass.
 *
 * Runs ONCE per behavior after the generator returns a valid plan.
 * The verifier's sole job is to check that the generator honored
 * the code-eval contract; it returns either approval or specific
 * `PlanEdit`s to fix contract violations.
 *
 * Embeds the same `CODE_EVAL_CONTRACT` string the generator saw,
 * so the critic checks against exactly what the generator was
 * told. No iterative loop — one verify, edits applied once,
 * render. If the edited plan is invalid, eval-gen falls back to
 * the original.
 */

import { CODE_EVAL_CONTRACT } from "./_code-eval-contract.js";

export const buildEvalGenVerifyPrompt = (): string => {
  return `You are a critic checking that an eval plan honors the code-eval
contract.

${CODE_EVAL_CONTRACT}

---

You receive:

1. The spec entry the eval is for (id, statement, rationale).
2. The full must_not list from the same spec.
3. The candidate \`AssertionPlan\` the generator produced.

Your sole job: **did the generator honor the contract above?**

Return one of:

\`\`\`json
{ "approve": true }
\`\`\`

if the plan tests the rule, every assertion is meaningful, and
the contract is respected; OR

\`\`\`json
{ "approve": false, "edits": [/* PlanEdit list */] }
\`\`\`

if the plan needs targeted revisions to come into compliance.

## When to return edits

Reject (return edits) if any of these are true:

- **A judge name violates the canonical naming rules.** Names
  with vacuous modifiers (\`Correctly\`, \`Properly\`,
  \`Successfully\`, \`Accurately\`, \`Reasonably\`), names baked
  with the case slug (\`…ForPwnRequestJudge\`), or names that
  describe a too-specific concept when a stem from the contract
  would fit (\`IdentifiesPullRequestTargetTriggerJudge\` →
  \`IdentifiesPrivilegedTriggerJudge\`) — return a
  \`rename-judge\` edit aligning to the canonical name. **Be
  liberal here**: this is the primary lever for keeping
  \`evals/_judges.ts\` small. If a similar canonical name plausibly
  works for the property, push toward it.
- A judge \`criterion\` bundles multiple properties (e.g.
  "identifies the trigger AND rates severity"). Return a
  \`split-judge\` edit with N narrower replacements.
- A case is missing a check for an obvious testable property
  (e.g. testing pwn-request without a check on whether the agent
  rated severity). Return an \`add-judge\` edit. When adding a
  judge, **prefer a canonical name from the contract's stems**;
  only mint a new name when no stem fits.
- A judge \`criterion\` is over 200 characters. Return
  \`shorten-criterion\` with a tightened 1-2 sentence rubric.
- A plan declares a judge that no case references. Return
  \`drop-judge\` to remove the dead declaration.
- **A judge could be replaced cleanly by a structural assertion.**
  This is the highest-impact edit. Look for:
  - The skill emits structured output → use \`output-match-object\`
    to pin the property.
  - The judge tests "did the agent inspect X" or "did the agent
    use Y tool" → use \`tool-calls\` with \`any-call\` /
    \`names-include\` instead.
  Return \`replace-judge-with-deterministic\` with the structural
  replacement(s). Be aggressive here — judges are LLM calls at
  test time; structural is free.
- **A case has tool-using behavior but no structural \`tool-calls\`
  assertion.** If the agent should read a specific file, call a
  helper, or avoid a dangerous tool, that should be a structural
  check. Return \`add-deterministic\` with a \`tool-calls\` entry
  (\`any-call\` proving the trace, or \`names-exclude\` for the
  forbidden tool).
- **A case has 3+ judges and no structural assertions.** Almost
  always a sign that some of the judges should collapse into
  tool-arg or output-shape checks. Return one or more
  \`replace-judge-with-deterministic\` edits.
- A case has an assertion that doesn't really test the rule.
  Return \`drop-assertion\` to remove it.

## Edit kinds

- \`{ "kind": "rename-judge", "judgeName": "OldName",
  "newName": "NewName" }\` — Rename a judge declaration AND every
  assertion that references it. Use this to align names with the
  canonical stems in the contract so consolidation dedupes
  cleanly across behaviors.
- \`{ "kind": "drop-judge", "judgeName": "FooJudge" }\` — Remove
  the judge declaration AND every assertion that references it.
- \`{ "kind": "split-judge", "judgeName": "BroadJudge",
  "replacements": [<JudgePlan>...], "caseAssignments": [<name>...] }\`
  — Replace one broad judge with N narrower judges. Each case
  that referenced the original gets one \`judge\` assertion per
  name in \`caseAssignments\`, in order.
- \`{ "kind": "add-judge", "judge": <JudgePlan>,
  "caseNames": [<case>...] }\` — Declare a new judge and append a
  \`judge\` assertion to each named case. Prefer canonical stem
  names from the contract.
- \`{ "kind": "replace-judge-with-deterministic", "judgeName":
  "FooJudge", "replacements": [<Assertion>...] }\` — Remove the
  judge declaration; substitute structural assertions
  (\`output-match-object\`, \`tool-calls\`) in every referencing
  case. Replacements MUST be structural — judges as replacements
  are rejected.
- \`{ "kind": "shorten-criterion", "judgeName": "FooJudge",
  "criterion": "<≤200 char rubric>" }\` — Replace a judge's
  criterion text.
- \`{ "kind": "add-deterministic", "caseName": "...",
  "assertion": <Assertion> }\` — Append one structural assertion
  (\`output-match-object\` or \`tool-calls\`) to a case. Judges
  are rejected here — use \`add-judge\` instead.
- \`{ "kind": "drop-assertion", "caseName": "...",
  "assertionIndex": 0 }\` — Remove one assertion by 0-based
  index.

Edits are applied in order. If a prior edit shifts indices in a
case, later index-based edits target the shifted positions.

## Banned edit kinds

- \`tighten-regex\` — regex assertions are banned outright; there
  are no patterns to tighten. If you'd reach for this, use
  \`split-judge\` (replace 1 broad regex-ish check with multiple
  narrow judges) instead.

## When to approve

Approve if:

- The plan tests the rule (judges and/or structural pin every
  load-bearing property).
- Each judge tests ONE property with a ≤200 char criterion.
- Multiple narrow judges per case (when the rule is free-form
  text) or a mix of structural + narrow judge (when the skill
  emits structured output).
- No banned assertion kinds (\`output-matches\`,
  \`output-contains\`, \`output-not-contains\`).
- No declared-but-unreferenced judges.

Approve readily — the goal is to catch real contract violations,
not to second-guess every plan.

## Output

Return ONLY the JSON object. No prose, no markdown fences.
Start with \`{\` and end with \`}\`.`;
};
