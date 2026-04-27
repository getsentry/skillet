import type { Context } from "@mariozechner/pi-ai";
import { completeWithBackoff } from "../../agent/complete-with-backoff.js";
import type { AnyModel } from "../../agent/provider.js";
import type { SkillSpec } from "../../spec/index.js";
import { buildSkillGenPrompt } from "../prompts/skill-gen.js";

const extractText = (response: { content: unknown[] }): string => {
  return response.content
    .filter((b): b is { type: "text"; text: string; textSignature?: string } => {
      return typeof b === "object" && b != null && (b as { type?: unknown }).type === "text";
    })
    .map((b) => b.text)
    .join("");
};

/**
 * The derived banner placed at the top of the generated SKILL.md
 * (after the frontmatter). Tells human readers that the file is
 * managed by skillet and points them at spec.yaml as the source.
 */
export const SKILL_MD_BANNER = `<!--
  This file is derived from spec.yaml. Do NOT edit by hand —
  changes will be overwritten on the next \`skillet spec refine\`,
  \`skillet add-eval\`, \`skillet improve\`, or \`skillet create\`
  invocation. Edit spec.yaml or use the spec subcommands instead.
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
      class: spec.class,
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
