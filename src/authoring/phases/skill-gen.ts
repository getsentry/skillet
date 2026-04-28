import type { Context } from "@mariozechner/pi-ai";
import { completeWithBackoff } from "../../agent/complete-with-backoff.js";
import type { AnyModel } from "../../agent/provider.js";
import type { SkillSpec } from "../../spec/index.js";
import { buildSkillGenPrompt } from "../prompts/skill-gen.js";
import { extractText } from "./_text.js";

/**
 * The derived banner placed at the top of the generated SKILL.md
 * (after the frontmatter). Points readers at spec.yaml as the
 * source of truth.
 *
 * SKILL.md may be edited by `skillet improve` between runs to tune
 * prose so the agent's behavior matches the spec under eval. Those
 * edits are preserved across improve iterations but get overwritten
 * when the spec itself changes (since regen produces a fresh
 * SKILL.md from the new spec).
 */
export const SKILL_MD_BANNER = `<!--
  Generated from spec.yaml. The behavior set, must-nots, and
  triggers live in spec.yaml — edit there. \`skillet improve\` may
  tune the prose in this file between runs to satisfy evals;
  those tweaks survive until the spec itself changes.
-->
`;

/**
 * Run the skill-gen phase: SkillSpec → SKILL.md content (string).
 *
 * The output includes the derived-file banner immediately after the
 * frontmatter. The caller writes the result to disk.
 */
export const runSkillGen = async (model: AnyModel, spec: SkillSpec): Promise<string> => {
  const specJson = JSON.stringify(
    {
      name: spec.name,
      intent: spec.intent,
      triggers: spec.triggers,
      behaviors: spec.behaviors.map((b) => ({
        id: b.id,
        statement: b.statement,
        rationale: b.rationale,
      })),
      must_not: spec.must_not.map((m) => ({
        id: m.id,
        statement: m.statement,
        rationale: m.rationale,
        leakage_risk: m.leakage_risk,
      })),
    },
    null,
    2,
  );

  const context: Context = {
    systemPrompt: buildSkillGenPrompt(),
    messages: [
      {
        role: "user",
        content: `Render SKILL.md for the following spec:\n\n\`\`\`json\n${specJson}\n\`\`\``,
        timestamp: Date.now(),
      },
    ],
  };

  const response = await completeWithBackoff(model, context);
  if (response.stopReason === "error") {
    const errMsg = response.errorMessage ?? "unknown error";
    throw new Error(`skill-gen: LLM returned error: ${errMsg}`);
  }

  const raw = extractText(response).trim();
  return injectDerivedBanner(raw);
};

/**
 * Insert the derived-file banner immediately after the closing
 * frontmatter delimiter. If the LLM omitted frontmatter (a generation
 * bug — the prompt requires it), prepend the banner anyway so the
 * file still carries the warning.
 */
const injectDerivedBanner = (skillMd: string): string => {
  if (!skillMd.startsWith("---")) {
    return SKILL_MD_BANNER + "\n" + skillMd;
  }
  const closingIdx = skillMd.indexOf("\n---", 3);
  if (closingIdx === -1) {
    return SKILL_MD_BANNER + "\n" + skillMd;
  }
  // Find the end of the closing-fence line. `closingIdx` points at the
  // newline before `---`, so jump past `\n---` (4 chars) plus any
  // trailing newline.
  const afterFence = closingIdx + 4;
  const next = skillMd.indexOf("\n", afterFence);
  const splitAt = next === -1 ? skillMd.length : next + 1;
  return skillMd.slice(0, splitAt) + "\n" + SKILL_MD_BANNER + skillMd.slice(splitAt);
};
