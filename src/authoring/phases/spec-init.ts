import type { AnyModel } from "../../agent/provider.js";
import {
  normalizeSpec,
  parseSpecJson,
  validateSpecObject,
  type SkillSpec,
} from "../../spec/index.js";
import { buildSpecInitPrompt } from "../prompts/spec-init.js";
import { isRecord } from "./_text.js";
import { PhaseInterruptedForHumanInput, runJsonPhaseWithRetries } from "./_retry.js";

const interruptIfHumanInputNeeded = (raw: string): void => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  if (!isRecord(parsed) || parsed.needs_human !== true) return;
  const question =
    typeof parsed.question === "string" && parsed.question.trim() !== ""
      ? parsed.question.trim()
      : "The spec planning phase needs a human decision before continuing.";
  const why =
    typeof parsed.why === "string" && parsed.why.trim() !== ""
      ? parsed.why.trim()
      : "The requested skill has high-impact ambiguity that would affect generated behaviors and evals.";
  throw new PhaseInterruptedForHumanInput(question, why);
};

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
      interruptIfHumanInputNeeded(raw);
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
