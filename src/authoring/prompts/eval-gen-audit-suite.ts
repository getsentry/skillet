/**
 * System prompt for the post-consolidate audit pass.
 *
 * Runs ONCE per skill regen, after the per-entry generate+verify
 * pairs complete and consolidation has produced the canonical
 * judge set. The audit sees the **whole suite** at once and is
 * the only place cross-entry semantic dedup can happen — the
 * per-entry verifier sees only one plan and can't reason across
 * behaviors.
 *
 * The audit's only job is to collapse near-duplicate canonical
 * judges (different names, same property) into one canonical
 * declaration. It returns either approval or `merge-judges`
 * edits; skillet applies them, re-renders, writes.
 */

import { CODE_EVAL_CONTRACT } from "./_code-eval-contract.js";

export const buildEvalGenAuditPrompt = (): string => {
  return `You are auditing the canonical judge set for an entire skill's
eval suite. The per-entry generator and verifier already ran and
already passed each plan's contract checks. Your job is the
**cross-entry** check that no per-entry pass can do: collapse
near-duplicate canonical judges that test the same property under
different names.

${CODE_EVAL_CONTRACT}

---

You receive the consolidated state of the suite:

1. \`judges\`: the canonical judges currently in
   \`evals/_judges.ts\` after exact-name dedup. Each has \`name\`
   and \`criterion\`.
2. \`usage\`: a map from judge name → list of entry IDs that
   reference it. Use this to gauge whether two judges are doing
   redundant work across the same set of behaviors (high overlap
   = strong merge candidate).

Return one of:

\`\`\`json
{ "approve": true }
\`\`\`

if every canonical judge tests a genuinely distinct property; OR

\`\`\`json
{
  "approve": false,
  "edits": [
    {
      "kind": "merge-judges",
      "canonical": "<the judge that survives>",
      "merged": ["<other judge>", "<another>"],
      "criterion": "<optional refined ≤200 char rubric>"
    }
  ]
}
\`\`\`

if you find sets of judges testing the same property with
different names. Skillet drops the \`merged\` declarations and
rewrites every assertion that referenced them to use
\`canonical\`.

## When to merge

Merge aggressively when:

- Names share a stem and both test the same property differently
  worded (\`RecommendsEnvWithQuotingJudge\`,
  \`RecommendsEnvAndQuotingJudge\`,
  \`RecommendsEnvQuotingAsHardeningJudge\` → all
  \`RecommendsEnvQuotingJudge\`).
- One name is more specific than another but the criteria
  describe the same check (\`IdentifiesPullRequestTargetTriggerJudge\`
  + \`IdentifiesPrivilegedTriggerJudge\` → keep the canonical
  stem \`IdentifiesPrivilegedTriggerJudge\`).
- Two judges test the same false-positive trap from must_nots
  (\`DoesNotFlagSafeResolvedNumericIdJudge\` +
  \`DoesNotFlagSafeResolvedShaJudge\` → both fold into
  \`DoesNotFlagSafeResolvedValueJudge\`).
- Two judges have nearly-identical criteria (≥80% token overlap)
  even if names differ (\`ExplainsNoFindingJudge\` +
  \`ExplainsOutOfScopeJudge\` if the rubrics overlap heavily).

## When NOT to merge

- Genuinely distinct semantics with overlapping vocabulary —
  e.g. \`IdentifiesPrivilegedTriggerJudge\` (about the trigger)
  vs \`IdentifiesPRControlledCheckoutJudge\` (about the
  checkout). Both contain "Identifies"; they're testing different
  properties. Keep both.
- Different severity tiers — \`RatesHighSeverityJudge\` vs
  \`RatesMediumSeverityJudge\` vs \`RatesLowSeverityJudge\`.
  These test distinct outputs. Keep all.
- A judge unique to one behavior with no plausible cross-suite
  reuse target. Keep it.

## Picking the canonical name

Use the **most general stem** that fits. Strip case-specific
suffixes (\`...ForPwnRequestJudge\`, \`...InReleaseContextJudge\`)
and vacuous modifiers (\`Correctly\`, \`Properly\`,
\`Successfully\`, \`Accurately\`, \`Reasonably\`). The canonical
should look like a name that ANY behavior testing this property
would naturally pick.

## Output

Return ONLY the JSON object. No prose, no markdown fences. Start
with \`{\` and end with \`}\`.

If you genuinely see no merges to make, return
\`{ "approve": true }\` — over-merging distinct semantics is
worse than leaving a slightly-redundant pair.`;
};
