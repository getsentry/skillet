/**
 * Shared prompt fragments for spec-init and spec-import.
 *
 * Both phases output the same `SkillSpec` JSON shape and share the
 * same JSON-vs-YAML rationale. Centralising the constants here
 * keeps the two prompts in sync — framing-specific guidance still
 * lives in the per-phase prompts.
 */

/**
 * Why JSON, plus the boundary between spec and eval files. Inserted
 * between the JSON schema block and the per-phase rules.
 */
export const SPEC_JSON_RATIONALE = `Why JSON: skill statements often contain colons, backticks, and other
characters that YAML treats as syntax (e.g. \`Format PR titles as
'feat(scope): subject'\`). JSON's strict string quoting eliminates
that whole class of parse errors. Skillet converts the JSON to YAML
internally before writing \`spec.yaml\`.

The spec captures intent only — behaviors, triggers, must-nots. It
does NOT carry eval implementation details. Eval cases (prompts,
expected outputs, setup scripts) live in the generated
\`evals/*.eval.ts\` file, not in the spec.`;

/** Closing instruction shared by both phases. */
export const OUTPUT_JSON_ONLY = `Output ONLY the JSON object. No prose, no markdown fences. Start
with \`{\` and end with \`}\`.`;
