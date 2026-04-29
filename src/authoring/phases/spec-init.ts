import type { AnyModel } from "../../agent/provider.js";
import {
  normalizeSpec,
  parseSpecJson,
  validateSpecObject,
  type SkillSpec,
} from "../../spec/index.js";
import { buildSpecInitPrompt } from "../prompts/spec-init.js";
import { runJsonPhaseWithRetries } from "./_retry.js";

/**
 * Run the spec-init phase: description → SkillSpec.
 *
 * Output is JSON (not YAML) to avoid ambiguous quoting on statements
 * containing colons, backticks, etc. The retry harness feeds parser
 * errors back to the LLM so it can fix specific malformations
 * before giving up.
 */
export const runSpecInit = async (model: AnyModel, description: string): Promise<SkillSpec> => {
  return runJsonPhaseWithRetries({
    model,
    systemPrompt: buildSpecInitPrompt(),
    userMessage: `Create a spec for the following skill:\n\n${description}`,
    phaseName: "spec-init",
    parseAndValidate: (raw) => {
      const spec = parseSpecJson(raw, "spec-init output");
      const normalized = normalizeSpec(spec);
      const validation = validateSpecObject(normalized, "spec-init output");
      if (!validation.valid) {
        const summary = validation.errors.map((e) => `- ${e.message}`).join("\n");
        throw new Error(`structural validation failed:\n${summary}`);
      }
      return normalized;
    },
  });
};
