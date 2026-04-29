import type { AnyModel } from "../../agent/provider.js";
import { parseFrontmatter } from "../../skill/loader.js";
import {
  normalizeSpec,
  parseSpecJson,
  validateSpecObject,
  type SkillSpec,
} from "../../spec/index.js";
import { buildSpecImportPrompt } from "../prompts/spec-import.js";
import { runJsonPhaseWithRetries } from "./_retry.js";

/** Frontmatter keys that skillet's typed schema covers — everything
 *  else gets passed through opaquely as `frontmatter_extras`. */
const KNOWN_FRONTMATTER_KEYS = new Set(["name", "description"]);

/**
 * Pluck unknown SKILL.md frontmatter keys (e.g. `allowed-tools`,
 * `argument-hint`, `model`) so they survive the import → regen
 * round-trip. Skillet's typed fields stay in the structured spec;
 * everything else lives under `frontmatter_extras` and is rendered
 * back into the regenerated SKILL.md.
 */
const captureFrontmatterExtras = (skillMdContent: string): Record<string, unknown> | undefined => {
  const { meta } = parseFrontmatter(skillMdContent);
  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (!KNOWN_FRONTMATTER_KEYS.has(key)) {
      extras[key] = value;
    }
  }
  return Object.keys(extras).length > 0 ? extras : undefined;
};

/**
 * Run the spec-import phase: SKILL.md content → SkillSpec.
 *
 * Output format mirrors spec-init for the same reason: skill
 * statements often contain characters that break YAML quoting.
 * Frontmatter keys outside skillet's typed schema are captured
 * mechanically — the LLM never sees or edits them.
 */
export const runSpecImport = async (
  model: AnyModel,
  skillMdContent: string,
): Promise<SkillSpec> => {
  const extras = captureFrontmatterExtras(skillMdContent);

  return runJsonPhaseWithRetries({
    model,
    systemPrompt: buildSpecImportPrompt(),
    userMessage: `## SKILL.md\n\n${skillMdContent}`,
    phaseName: "spec-import",
    parseAndValidate: (raw) => {
      const spec = parseSpecJson(raw, "spec-import output");
      const normalized = normalizeSpec(spec);
      if (extras != null) {
        normalized.frontmatter_extras = extras;
      }
      const validation = validateSpecObject(normalized, "spec-import output");
      if (!validation.valid) {
        const summary = validation.errors.map((e) => `- ${e.message}`).join("\n");
        throw new Error(`structural validation failed:\n${summary}`);
      }
      return normalized;
    },
  });
};
