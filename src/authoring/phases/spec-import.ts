import type { Context } from "@mariozechner/pi-ai";
import { completeWithBackoff } from "../../agent/complete-with-backoff.js";
import type { AnyModel } from "../../agent/provider.js";
import { parseSpecYaml, uniqueSlug, validateSpecObject, type SkillSpec } from "../../spec/index.js";
import { buildSpecImportPrompt } from "../prompts/spec-import.js";

const SLUG_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

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

const normalize = (spec: SkillSpec): SkillSpec => {
  const usedIds = new Set<string>();

  const normalizedBehaviors = spec.behaviors.map((b, i) => {
    if (b.id === "" || !SLUG_RE.test(b.id) || usedIds.has(b.id)) {
      const fresh = uniqueSlug(b.statement, usedIds, i);
      usedIds.add(fresh);
      return { ...b, id: fresh };
    }
    usedIds.add(b.id);
    return b;
  });

  const normalizedMustNot = spec.must_not.map((m, i) => {
    if (m.id === "" || !SLUG_RE.test(m.id) || usedIds.has(m.id)) {
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
    behaviors: normalizedBehaviors,
    must_not: normalizedMustNot,
  };
};

/**
 * Run the spec-import phase: SKILL.md content (+ optional existing
 * eval YAMLs) → SkillSpec.
 *
 * The eval YAML content is supplied as a single concatenated string
 * for the LLM's context — we don't structurally parse it here, since
 * the importer just looks for case names matching the
 * `<id>__<slug>` convention.
 */
export const runSpecImport = async (
  model: AnyModel,
  skillMdContent: string,
  existingEvalYaml?: string,
): Promise<SkillSpec> => {
  const userBlocks = [`## SKILL.md\n\n${skillMdContent}`];
  if (existingEvalYaml != null && existingEvalYaml.trim() !== "") {
    userBlocks.push(`## Existing eval YAML\n\n${existingEvalYaml}`);
  }

  const context: Context = {
    systemPrompt: buildSpecImportPrompt(),
    messages: [
      {
        role: "user",
        content: userBlocks.join("\n\n---\n\n"),
        timestamp: Date.now(),
      },
    ],
  };

  const response = await completeWithBackoff(model, context);
  if (response.stopReason === "error") {
    const errMsg = response.errorMessage ?? "unknown error";
    throw new Error(`spec-import: LLM returned error: ${errMsg}`);
  }

  const raw = stripFences(extractText(response));
  let spec: SkillSpec;
  try {
    spec = parseSpecYaml(raw, "spec-import output");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`spec-import: failed to parse LLM output as spec.yaml: ${msg}`, {
      cause: err,
    });
  }

  const normalized = normalize(spec);

  const validation = validateSpecObject(normalized, "spec-import output");
  if (!validation.valid) {
    const summary = validation.errors.map((e) => `- ${e.message}`).join("\n");
    throw new Error(
      `spec-import: produced spec failed structural validation:\n${summary}\n\nRaw LLM output:\n${raw}`,
    );
  }

  return normalized;
};
