import { loadAuthoringGuidance, loadSkillPatterns } from "../references.js";
import { OUTPUT_JSON_ONLY, SPEC_JSON_RATIONALE } from "./_spec-output-format.js";

/**
 * System prompt for the spec-init phase: produce a `spec.yaml` from
 * a free-form description.
 *
 * The output is JSON that we parse directly. The spec captures intent
 * — behaviors, must_nots, triggers, intent — not eval implementation.
 * Eval files are generated separately into `evals/*.eval.ts` from the
 * spec's behaviors.
 */
export const buildSpecInitPrompt = (): string => {
  const patterns = loadSkillPatterns();
  const guidance = loadAuthoringGuidance();

  return `You are an expert skill author. Your job is to convert a description of
a skill into a structured specification — \`spec.yaml\` — that drives
generation of SKILL.md and eval cases.

## Quality Standards

${patterns}

---

${guidance}

---

## Output Format

Normally, output a single JSON object with these fields:

\`\`\`json
{
  "managed_by": "skillet",
  "spec_version": 1,
  "name": "<kebab-case skill name>",
  "intent": "<one-paragraph statement of what the skill does and why>",

  "triggers": {
    "should": ["<phrase 1>", "<phrase 2>", "..."],
    "should_not": ["<near-miss phrase>", "..."]
  },

  "behaviors": [
    {
      "id": "<kebab-case slug>",
      "statement": "<imperative one-line rule>",
      "rationale": "<why this rule matters>"
    }
  ],

  "must_not": [
    {
      "id": "<kebab-case slug>",
      "statement": "<rule the skill must NOT do>",
      "rationale": "<why>"
    }
  ],

  "references": [
    {
      "path": "references/<slug>.md",
      "title": "<short title>",
      "load_when": "<when the agent should read this file>",
      "purpose": "<why this reference is needed>",
      "topics": ["<topic 1>", "<topic 2>", "..."]
    }
  ]
}
\`\`\`

${SPEC_JSON_RATIONALE}

## Human Clarification Escape Hatch

If a high-impact planning decision is genuinely underdetermined, stop
instead of guessing. This should be rare and reserved for ambiguity that
would materially change the skill's behavior/evals: skill class, trusted
source set, target product/framework family, risk tolerance, or whether a
neighboring domain is intentionally in scope.

When that happens, output ONLY:

\`\`\`json
{
  "needs_human": true,
  "question": "One concise question to ask the skill owner",
  "why": "Why answering changes the generated spec"
}
\`\`\`

Do not ask about cosmetic wording or choices you can safely infer. Prefer
reasonable assumptions when the generated spec can be corrected later with
\`skillet spec refine\`.

## Authoring rules

1. **Behaviors are imperative one-liners.** "Flag N+1 queries in loops"
   not "The skill should detect performance regressions". Each behavior
   becomes one section in SKILL.md and one eval case.

2. **Cover the rules a senior reviewer of the domain would name.** Don't
   pad with vague behaviors, but do not compress broad domains into a
   shallow core. Match the behavior count to the class:
   - simple procedural/convention skills: 5-10 behaviors/must_nots
   - integration/documentation skills: 10-20 behaviors/must_nots
   - security-review or domain-expert skills: 18-40 behaviors/must_nots
     spanning detection behaviors, investigation workflow, false-positive
     traps, severity/output calibration, and neighboring classes to avoid.

3. **Use references for depth that would bloat SKILL.md.** Simple
   procedural skills usually have \`"references": []\`. Security-review,
   domain-expert, framework-specific, provider-specific, or product-
   specific skills should include one or more reference entries when
   the agent needs deeper checklists, examples, false-positive traps,
   severity rules, or framework/product routing guidance. Reference
   paths must be one-level files under \`references/\`, for example
   \`references/django-access.md\`.

4. **For security-review skills, depth is mandatory.** Include the
   vulnerability classes/patterns, exploitability trace, concrete fix
   expectations, severity calibration, and false-positive traps a senior
   reviewer would expect. If the description names broad stacks,
   frameworks, providers, or product-specific contexts, add behaviors for
   conditional reference/routing guidance and add reference entries for
   the material the agent should load only when relevant.

5. **Each behavior gets a kebab-case id**, ideally derived from the
   action verb + object (\`flag-n-plus-one\`, \`recommend-prefetch-
   related\`). IDs must be unique across behaviors AND must_nots.

6. **Triggers are real phrases.** Include 5+ \`should\` phrases users
   would actually say (formal and casual, with and without keywords).
   Include 1-3 \`should_not\` near-miss phrases that share keywords but
   need a different skill.

7. **Must-nots are explicit refusals or anti-patterns.** "Don't flag
   single .get() calls as N+1" is a must-not. "Never tell users to
   set DJANGO_SETTINGS_MODULE" is a must-not (with a leakage_risk hint
   if applicable).

${OUTPUT_JSON_ONLY}`;
};
