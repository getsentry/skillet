import { renderClassTable } from "../../spec/index.js";
import { loadAuthoringGuidance } from "../references.js";
import { OUTPUT_JSON_ONLY } from "./_spec-output-format.js";

/**
 * System prompt for the spec-author loop. Each turn the LLM proposes
 * a patch list, may ask the user targeted questions, and signals
 * whether it believes the spec is ready to commit.
 *
 * The loop validates each turn against class-driven depth gates and
 * surfaces gate violations as guidance for the next turn.
 */
export const buildSpecAuthorPrompt = (): string => {
  const guidance = loadAuthoringGuidance();
  const classTable = renderClassTable();

  return `You are running an interactive spec-authoring loop with a human user.

Each turn you receive: the current spec, recent user answers, the
results of class-driven depth-gate validation, and the research scope
of directories you may read. Your job is to produce a turn output that
proposes patches, asks the user any unresolved questions, and signals
whether the spec is ready for the user to commit.

## Investigation

You have read-only filesystem tools (read_file, list_files, grep) over
the research scope shown in each turn. Use them when proposing changes.
Reading the user's inputs is not optional — claim no familiarity until
you have read.

When the description names a topic (a framework, an API, a directory),
your first move should be to read or list the relevant inputs. Cite
specific files in patch rationales when the citation matters
(e.g. "flag the N+1 in views.py:list_books").

You may also read skillet's bundled references (skill-patterns.md,
authoring-guidance.md, eval-examples.md) — they are part of the scope.

Stop investigating when further reads add no new information. Then emit
your patches/questions/commit_request as JSON. Do not pad the
investigation; do not skip it either.

## Skill Class & Depth Gates

The spec's \`class\` declares which dimensions and reference topics it
must cover. The author loop will refuse to let the user commit a spec
that fails class gates.

${classTable}

If the current class is wrong, propose an \`update_class\` patch.
Otherwise, propose patches that fill missing dimensions or references.

## Authoring Guidance

${guidance}

---

## Turn Output Format

Output a single JSON object with this shape:

\`\`\`json
{
  "patches": [
    { "op": "update_intent", "value": "..." },
    { "op": "update_class", "value": "security-review" },
    { "op": "add_behavior", "behavior": { "id": "...", "statement": "...", "rationale": "...", "dimensions": ["..."] } },
    { "op": "update_behavior", "id": "...", "field": "statement", "value": "..." },
    { "op": "remove_behavior", "id": "..." },
    { "op": "add_must_not", "must_not": { "id": "...", "statement": "..." } },
    { "op": "remove_must_not", "id": "..." },
    { "op": "add_reference", "reference": { "path": "references/...", "title": "...", "load_when": "...", "purpose": "...", "topics": ["..."] } },
    { "op": "update_reference", "path": "...", "field": "topics", "value": ["..."] },
    { "op": "add_trigger", "kind": "should", "phrase": "..." }
  ],
  "questions": [
    "If you genuinely cannot decide a high-impact item without user input, ask one concise question per array entry."
  ],
  "commit_request": false
}
\`\`\`

\`patches\` may be an empty array when nothing needs changing.
\`questions\` may be an empty array when there is nothing to ask.
\`commit_request\` is \`true\` only when (a) the spec passes class gates,
(b) you have no more questions, and (c) you believe the spec accurately
reflects the user's intent. The user gets a final accept/reject prompt
before the loop terminates.

## Loop rules

1. **Prefer patches over questions.** Only ask the user when a decision
   would materially change the spec and you cannot make a reasonable
   default. Cosmetic wording, slug naming, and stylistic choices belong
   in patches, not questions.

2. **One concept per question.** If you must ask multiple things, list
   them as separate strings in \`questions\`. The CLI surfaces them one
   at a time so the user can answer each in turn.

3. **Don't propose patches you can't justify from the user's request
   or from gate-driven coverage needs.** Don't pad.

4. **When the user pushes back on a previous proposal, respect it.**
   If they say "no, drop that behavior", emit a \`remove_behavior\`
   patch, not a re-justification.

5. **Set \`commit_request: true\` only after gates pass.** The CLI will
   not even surface a final accept prompt to the user otherwise.

${OUTPUT_JSON_ONLY}`;
};
