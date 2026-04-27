import type { Context } from "@mariozechner/pi-ai";
import { completeWithBackoff } from "../../agent/complete-with-backoff.js";
import type { AnyModel } from "../../agent/provider.js";
import {
  parseSpecYaml,
  uniqueSlug,
  validateSpecObject,
  type SkillSpec,
} from "../../spec/index.js";
import { buildSpecInitPrompt } from "../prompts/spec-init.js";

const stripFences = (text: string): string => {
  const fence = /^```(?:ya?ml)?\s*\n([\s\S]*?)\n```\s*$/i.exec(text.trim());
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
 * Normalize an LLM-produced spec: auto-slugify any missing or invalid
 * IDs, ensure `managed_by` and `spec_version` literals are correct.
 *
 * The structural validator only catches duplicate / malformed IDs;
 * it doesn't auto-fix them. We do that here so the LLM can be a
 * little sloppy about IDs and we still produce a valid spec.
 */
const normalize = (spec: SkillSpec): SkillSpec => {
  const usedIds = new Set<string>();

  const normalizeBehaviors = spec.behaviors.map((b, i) => {
    if (b.id === "" || !/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(b.id) || usedIds.has(b.id)) {
      const fresh = uniqueSlug(b.statement, usedIds, i);
      usedIds.add(fresh);
      return { ...b, id: fresh };
    }
    usedIds.add(b.id);
    return b;
  });

  const normalizeMustNot = spec.must_not.map((m, i) => {
    if (m.id === "" || !/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(m.id) || usedIds.has(m.id)) {
      const fresh = uniqueSlug(m.statement, usedIds, i);
      usedIds.add(fresh);
      return { ...m, id: fresh };
    }
    usedIds.add(m.id);
    return m;
  });

  return {
    ...spec,
    managed_by: "skillet",
    spec_version: 1,
    behaviors: normalizeBehaviors,
    must_not: normalizeMustNot,
  };
};

/**
 * Run the spec-init phase: description → SkillSpec.
 *
 * Throws if the LLM produces output that can't be parsed as YAML or
 * fails structural validation after normalization. The caller (the
 * `spec init` command) handles the error.
 */
export const runSpecInit = async (
  model: AnyModel,
  description: string,
): Promise<SkillSpec> => {
  const context: Context = {
    systemPrompt: buildSpecInitPrompt(),
    messages: [
      {
        role: "user",
        content: `Create a spec.yaml for the following skill:\n\n${description}`,
        timestamp: Date.now(),
      },
    ],
  };

  const response = await completeWithBackoff(model, context);
  if (response.stopReason === "error") {
    const errMsg = response.errorMessage ?? "unknown error";
    throw new Error(`spec-init: LLM returned error: ${errMsg}`);
  }

  const raw = stripFences(extractText(response));
  let spec: SkillSpec;
  try {
    spec = parseSpecYaml(raw, "spec-init output");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`spec-init: failed to parse LLM output as spec.yaml: ${msg}`, { cause: err });
  }

  const normalized = normalize(spec);

  const validation = validateSpecObject(normalized, "spec-init output");
  if (!validation.valid) {
    const summary = validation.errors.map((e) => `- ${e.message}`).join("\n");
    throw new Error(
      `spec-init: produced spec failed structural validation:\n${summary}\n\nRaw LLM output:\n${raw}`,
    );
  }

  return normalized;
};
