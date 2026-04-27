import type { Context } from "@mariozechner/pi-ai";
import { completeWithBackoff } from "../../agent/complete-with-backoff.js";
import type { AnyModel } from "../../agent/provider.js";
import { renderSpec, SPEC_PATCH_OPS, type SkillSpec, type SpecPatch } from "../../spec/index.js";
import { buildSpecRefinePrompt } from "../prompts/spec-refine.js";

const stripFences = (text: string): string => {
  const fence = /^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/i.exec(text.trim());
  return fence?.[1]?.trim() ?? text.trim();
};

const extractText = (response: { content: unknown[] }): string => {
  return response.content
    .filter((b): b is { type: "text"; text: string; textSignature?: string } => {
      return typeof b === "object" && b != null && (b as { type?: unknown }).type === "text";
    })
    .map((b) => b.text)
    .join("");
};

/**
 * Validate a parsed JSON value as a `SpecPatch`. Returns the patch on
 * success, throws on unknown ops or malformed shape. The patcher
 * itself runs the same kind of check during application; doing it
 * here lets us fail with the index of the bad op so the LLM can
 * correct on retry.
 */
const validatePatch = (raw: unknown, index: number): SpecPatch => {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`patch at index ${index}: not an object`);
  }
  const obj = raw as Record<string, unknown>;
  const op = obj.op;
  if (typeof op !== "string") {
    throw new Error(`patch at index ${index}: missing 'op' field`);
  }
  const knownOps: ReadonlySet<string> = new Set<string>(SPEC_PATCH_OPS);
  if (!knownOps.has(op)) {
    throw new Error(`patch at index ${index}: unknown op '${op}'`);
  }
  // We trust the structural shape beyond `op` and let `applyPatch`
  // catch missing fields; the patcher's error messages are already
  // useful and we don't want to duplicate the validation logic here.
  return raw as SpecPatch;
};

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

  const raw = stripFences(extractText(response));
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

  return parsed.map(validatePatch);
};
