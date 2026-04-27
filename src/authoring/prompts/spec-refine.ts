/**
 * System prompt for the spec-refine phase: convert natural-language
 * feedback about a spec into a list of `SpecPatch` operations that
 * the patcher applies deterministically.
 *
 * The same prompt shape is used by `skillet spec refine "<feedback>"`
 * and by the assessment phase inside the iteration loop. The
 * difference is the feedback content — assessment feeds verify
 * reports + eval results; refine feeds the user's words.
 */
export const buildSpecRefinePrompt = (): string => {
  return `You are translating natural-language feedback about a skill's spec
into a structured list of patch operations.

You will receive:
1. The current \`spec.yaml\` content.
2. Feedback describing what should change.

Your job is to output a JSON array of patch operations that, when
applied in order, achieve the requested change. The patcher applies
ops deterministically — you don't need to rewrite the spec; you just
name the smallest fixes.

## Patch operations

Each operation is a JSON object with an \`op\` field and operation-
specific arguments:

\`\`\`json
{ "op": "update_intent", "value": "<new intent text>" }

{ "op": "update_behavior", "id": "<behavior id>", "field": "statement", "value": "<new statement>" }
{ "op": "update_behavior", "id": "<behavior id>", "field": "rationale", "value": "<new rationale>" }

{ "op": "add_behavior", "behavior": {
    "id": "<kebab-case slug>",
    "statement": "<imperative one-line rule>",
    "rationale": "<why>",
    "eval": { "prompt": "...", "expect": "..." }
} }

{ "op": "remove_behavior", "id": "<behavior id>" }

{ "op": "update_eval", "id": "<behavior or must_not id>", "eval": {
    "prompt": "<new prompt>",
    "expect": "<new substring>"
    // OR (mutually exclusive):
    // "criteria": "<new judge criterion>"
} }

{ "op": "update_must_not", "id": "<must_not id>", "field": "statement", "value": "<new>" }
{ "op": "update_must_not", "id": "<must_not id>", "field": "rationale", "value": "<new>" }
{ "op": "update_must_not", "id": "<must_not id>", "field": "leakage_risk", "value": "<label>" }

{ "op": "add_must_not", "must_not": {
    "id": "<kebab-case slug>",
    "statement": "<rule the skill must NOT do>",
    "rationale": "<why>",
    "eval": { "prompt": "...", "criteria": "..." }
} }

{ "op": "remove_must_not", "id": "<must_not id>" }

{ "op": "add_trigger", "kind": "should", "phrase": "<phrase>" }
{ "op": "add_trigger", "kind": "should_not", "phrase": "<phrase>" }
{ "op": "remove_trigger", "kind": "should", "phrase": "<exact existing phrase>" }
{ "op": "remove_trigger", "kind": "should_not", "phrase": "<exact existing phrase>" }
\`\`\`

## Rules

1. **Only emit operations that match the listed ops.** The patcher
   rejects unknown ops — invalid output fails the run rather than
   silently dropping changes.

2. **Reference IDs that exist in the current spec.** \`update_*\` and
   \`remove_*\` ops fail if the ID isn't present. \`add_*\` ops fail if
   the ID is already taken.

3. **New IDs must be kebab-case slugs starting with a letter** and
   unique across the combined behaviors + must_nots namespace.

4. **\`update_eval\` works for both behaviors and must_nots** — the
   patcher resolves the ID across both groups. Negative cases (must_not)
   must use \`criteria\` not \`expect\`.

5. **Be minimal.** If feedback says "tighten behavior X to also cover
   list comprehensions", emit one \`update_behavior\` op. Don't rewrite
   adjacent behaviors that weren't asked about. Each unnecessary op
   is a chance to introduce drift.

6. **Empty array means no change.** If the feedback doesn't actually
   ask for a spec change (e.g. asks a clarifying question), emit
   \`[]\`. The CLI surfaces this as "no patches applied".

Output ONLY the JSON array. No prose, no markdown fences. Start with
\`[\`.`;
};
