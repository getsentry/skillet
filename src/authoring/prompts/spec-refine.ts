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

6. **Default to adding; merge only with high precision.** When the
   user asks for a new behavior, your first question is "is there
   an existing behavior + eval that already tests THIS SPECIFIC
   scenario?" If you can't answer "yes" with confidence, treat the
   user's request as a new behavior. Two narrow rules is always
   better than one overloaded rule.

   Decision matrix for an incoming behavior:

   | Existing entry says... | Existing has eval? | Eval tests the user's specific scenario? | Action |
   |---|---|---|---|
   | Exact same rule | yes | yes, fully | skip — emit no patch for this entry; mention in passing |
   | Exact same rule | yes | no — covers a different specific case | \`add_behavior\` (with eval) — separate, narrower entry |
   | Exact same rule | no eval | n/a | \`update_eval\` on existing — fill in the missing eval, don't add a duplicate behavior |
   | Related but different scope | any | partial overlap | \`add_behavior\` (with eval) — keep as separate narrow entry |
   | Unrelated | any | n/a | \`add_behavior\` (with eval) |

   Avoid merging into an existing entry just because the topics
   overlap. "Branch names follow \`<prefix>/<type>/<short-desc>\`"
   and "Branch names append a numeric suffix on collision" are
   related but test different things — keep them separate. Forcing
   them together produces an eval that has to assert both at once,
   which the assessor can't repair cleanly when only one fails.

   When you DO skip a user's request because an existing eval fully
   covers it, that's fine — but only with confidence. Uncertainty
   defaults to adding.

7. **Empty array means no change.** Emit \`[]\` when:
   - The feedback asks a clarifying question rather than requesting
     a change.
   - The feedback applies cleanly via existing entries (already
     handled).
   - **The feedback is off-topic for this skill.** If the request
     describes behavior unrelated to the skill's stated \`intent\` or
     domain (e.g. asking a git-branch skill to add rules about
     try/except handling, or asking a Python performance skill to
     add rules about CSS), refuse by emitting \`[]\`. Do NOT compile
     irrelevant feedback into patches just because the input was
     well-formed. The spec is not a junk drawer for whatever
     mistyped command went here.

   The skill's \`intent\` field is the source of truth for what is
   on-topic. If you're unsure, lean toward refusing — the user can
   re-run with corrected input or with the right skill path.

Output ONLY the JSON array. No prose, no markdown fences. Start with
\`[\`.`;
};
