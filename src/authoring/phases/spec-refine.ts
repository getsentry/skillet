import type { Context } from "@mariozechner/pi-ai";
import { completeWithBackoff } from "../../agent/complete-with-backoff.js";
import type { AnyModel } from "../../agent/provider.js";
import { renderSpec, validateSpecPatch, type SkillSpec, type SpecPatch } from "../../spec/index.js";
import { buildSpecRefinePrompt } from "../prompts/spec-refine.js";
import { extractText, stripFences } from "./_text.js";

/**
 * Run the spec-refine phase: current spec + feedback → SpecPatch[].
 *
 * Returns an empty array if the LLM decided no patch was needed
 * (e.g. the user asked a question rather than requesting a change).
 * Throws if the JSON is malformed — that's a generator bug, not a
 * spec bug, and surfacing it tells us the prompt needs tuning.
 */
export const runSpecRefine = async (
  model: AnyModel,
  spec: SkillSpec,
  feedback: string,
): Promise<SpecPatch[]> => {
  const specYaml = renderSpec(spec);
  const userContent = `## Current spec.yaml\n\n${specYaml}\n\n## Feedback\n\n${feedback}`;

  const context: Context = {
    systemPrompt: buildSpecRefinePrompt(),
    messages: [{ role: "user", content: userContent, timestamp: Date.now() }],
  };

  const response = await completeWithBackoff(model, context);
  if (response.stopReason === "error") {
    const errMsg = response.errorMessage ?? "unknown error";
    throw new Error(`spec-refine: LLM returned error: ${errMsg}`);
  }

  const raw = stripFences(extractText(response), "json");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`spec-refine: LLM output is not valid JSON: ${msg}\n\nRaw output:\n${raw}`, {
      cause: err,
    });
  }

  if (!Array.isArray(parsed)) {
    throw new Error(
      `spec-refine: LLM output is not a JSON array of patches\n\nRaw output:\n${raw}`,
    );
  }

  return parsed.map(validateSpecPatch);
};
