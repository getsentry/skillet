/**
 * Content of the generated agent workflow files. Deliberately thin
 * (agent-integration spec): they script the agent into a `skillet
 * status` / `skillet instructions --json` loop; all authoring
 * guidance lives in the CLI so upgrading skillet upgrades every
 * agent's behavior.
 */

export interface WorkflowDef {
  id: string;
  description: string;
  /** May reference sibling workflows as {{cmd:<id>}} — each generator substitutes its tool's command form. */
  body: string;
}

export const WORKFLOWS: WorkflowDef[] = [
  {
    id: "propose",
    description:
      "Author a skill spec (spec.md) from a description, interviewing the user as needed",
    body: `Author a spec.md for a new or existing skill. The spec codifies intent; nothing else is written in this workflow.

1. If there is no skill directory yet, pick a kebab-case name and run \`skillet new <name>\`.
2. Run \`skillet instructions spec <skill-dir> --json\` and follow its instructions and template exactly.
3. If the user's request leaves intent, triggers, or edge cases ambiguous, ask the user 2-4 pointed questions before writing. Do not invent answers.
4. Write spec.md, then run \`skillet validate <skill-dir>\` and fix every error it reports.
5. Show the user the behaviors and triggers you captured, then suggest {{cmd:render}} to produce SKILL.md and evals.`,
  },
  {
    id: "render",
    description: "Render SKILL.md and eval cases from a skill's spec.md",
    body: `Render the derived artifacts (SKILL.md, references, eval cases) from spec.md.

1. Run \`skillet status <skill-dir> --json\`. If spec.md is missing, stop and point the user at {{cmd:propose}}.
2. Run \`skillet instructions skill <skill-dir> --json\` and write SKILL.md (and references/ files if the instructions call for them) following it exactly.
3. Run \`skillet instructions evals <skill-dir> --json\` and write eval cases — at least one per behavior — plus any fixtures they reference.
4. Run \`skillet validate <skill-dir>\` and fix every error; repeat until valid.
5. Offer to run \`skillet eval <skill-dir>\` (mention --trials and --baseline for statistically meaningful results).`,
  },
  {
    id: "improve",
    description: "Iterate on a skill using its eval results",
    body: `Improve a skill from failing or unconvincing eval results.

1. Run \`skillet eval <skill-dir> --json\` (add --case <id> to focus, --trials 3 when results look flaky). Read the failing trials' checks and transcripts.
2. Diagnose each failure into one of: the SKILL.md wording is weak, the spec behavior is wrong or ambiguous, or the eval case itself is unfair. Say which and why before editing.
3. Apply the fix at the right layer — spec changes first when intent was wrong (then re-render via \`skillet instructions skill\`), SKILL.md wording for expression problems, the case file only when the eval was unfair.
4. Re-run \`skillet validate\` and the affected cases. Repeat until green or you need a user decision.
5. When results look good, suggest \`skillet eval --trials 3 --baseline\` and report per-behavior lift to the user.`,
  },
  {
    id: "migrate",
    description: "Migrate a legacy skill (spec.yaml or bare SKILL.md) to spec.md + YAML eval cases",
    body: `Migrate a legacy skill to the current format. Legacy skills have a spec.yaml (old skillet) or only a SKILL.md, and possibly evals/*.eval.ts files.

1. Read the legacy artifacts: spec.yaml (intent, triggers, behaviors, must_nots), SKILL.md, and any evals/*.eval.ts.
2. Run \`skillet instructions spec <skill-dir> --json\` and write spec.md preserving the legacy intent: behaviors keep their ids where possible, triggers map to SHOULD/SHOULD NOT bullets, must_nots become Constraints.
3. Run \`skillet instructions evals <skill-dir> --json\` and re-express each legacy eval's intent as a YAML case (fixtures can be reused as-is; _setup.sh contents become the case's setup field).
4. Run \`skillet validate <skill-dir>\` and fix every error.
5. Ask the user before deleting legacy files (spec.yaml, *.eval.ts) — deletion is their call, and SKILL.md should be re-rendered via {{cmd:render}} only if they want it regenerated.`,
  },
];
