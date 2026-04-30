import type { AnyModel } from "../../agent/provider.js";
import {
  normalizeSpec,
  parseSpecJson,
  validateSpecObject,
  type SkillSpec,
} from "../../spec/index.js";
import { buildSeedFromDescriptionPrompt } from "../prompts/seed-from-description.js";
import { runJsonPhaseWithRetries } from "../phases/_retry.js";

/**
 * Description seed: an LLM proposes a baseline spec from a free-form
 * description. Output includes a proposed `class`. The author loop
 * runs after this to validate class gates and dialogue with the user.
 */
export const seedFromDescription = async (
  model: AnyModel,
  description: string,
): Promise<SkillSpec> => {
  return runJsonPhaseWithRetries({
    model,
    systemPrompt: buildSeedFromDescriptionPrompt(),
    userMessage: `Create a baseline spec for the following skill:\n\n${description}`,
    phaseName: "seed-from-description",
    parseAndValidate: (raw) => {
      const spec = parseSpecJson(raw, "seed-from-description output");
      const normalized = normalizeSpec(spec);
      const validation = validateSpecObject(normalized, "seed-from-description output");
      if (!validation.valid) {
        const summary = validation.errors.map((e) => `- ${e.message}`).join("\n");
        throw new Error(`structural validation failed:\n${summary}`);
      }
      return normalized;
    },
  });
};
