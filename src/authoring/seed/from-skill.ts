import type { AnyModel } from "../../agent/provider.js";
import { parseFrontmatter } from "../../skill/loader.js";
import {
  normalizeSpec,
  parseSpecJson,
  validateSpecObject,
  type SkillSpec,
} from "../../spec/index.js";
import { buildSeedFromSkillPrompt } from "../prompts/seed-from-skill.js";
import { runJsonPhaseWithRetries } from "../phases/_retry.js";

/** Frontmatter keys covered by skillet's typed schema; everything else
 *  rides through as `frontmatter_extras`. */
const KNOWN_FRONTMATTER_KEYS = new Set(["name", "description"]);

const captureFrontmatterExtras = (skillMd: string): Record<string, unknown> | undefined => {
  const { meta } = parseFrontmatter(skillMd);
  const extras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (!KNOWN_FRONTMATTER_KEYS.has(k)) extras[k] = v;
  }
  return Object.keys(extras).length > 0 ? extras : undefined;
};

/**
 * Existing-skill seed: reverse-derive a baseline spec from an
 * existing SKILL.md. Frontmatter passthrough keys (`allowed-tools`,
 * etc.) are captured mechanically; behaviors and class are inferred
 * by the LLM from the body. The author loop refines after this.
 */
export const seedFromSkill = async (model: AnyModel, skillMd: string): Promise<SkillSpec> => {
  const extras = captureFrontmatterExtras(skillMd);

  return runJsonPhaseWithRetries({
    model,
    systemPrompt: buildSeedFromSkillPrompt(),
    userMessage: `## SKILL.md\n\n${skillMd}`,
    phaseName: "seed-from-skill",
    parseAndValidate: (raw) => {
      const spec = parseSpecJson(raw, "seed-from-skill output");
      const normalized = normalizeSpec(spec);
      if (extras != null) normalized.frontmatter_extras = extras;
      const validation = validateSpecObject(normalized, "seed-from-skill output");
      if (!validation.valid) {
        const summary = validation.errors.map((e) => `- ${e.message}`).join("\n");
        throw new Error(`structural validation failed:\n${summary}`);
      }
      return normalized;
    },
  });
};
