import type { Context, Message } from "@mariozechner/pi-ai";
import { completeWithBackoff } from "../../agent/complete-with-backoff.js";
import type { AnyModel } from "../../agent/provider.js";
import { parseSpecJson, uniqueSlug, validateSpecObject, type SkillSpec } from "../../spec/index.js";
import { buildSpecImportPrompt } from "../prompts/spec-import.js";
import { extractText, stripFences } from "./_text.js";

const SLUG_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const MAX_PARSE_RETRIES = 2;

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
 * Output is JSON (not YAML) for the same reason as spec-init: skill
 * statements often contain characters that break YAML quoting.
 * Retries up to `MAX_PARSE_RETRIES` times on parse failure with the
 * parser error fed back to the LLM.
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

  const messages: Message[] = [
    { role: "user", content: userBlocks.join("\n\n---\n\n"), timestamp: Date.now() },
  ];

  let lastRaw = "";
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_PARSE_RETRIES; attempt++) {
    const context: Context = { systemPrompt: buildSpecImportPrompt(), messages };
    const response = await completeWithBackoff(model, context);
    if (response.stopReason === "error") {
      const errMsg = response.errorMessage ?? "unknown error";
      throw new Error(`spec-import: LLM returned error: ${errMsg}`);
    }

    lastRaw = stripFences(extractText(response), "json");
    try {
      const spec = parseSpecJson(lastRaw, "spec-import output");
      const normalized = normalize(spec);
      const validation = validateSpecObject(normalized, "spec-import output");
      if (!validation.valid) {
        const summary = validation.errors.map((e) => `- ${e.message}`).join("\n");
        throw new Error(`structural validation failed:\n${summary}`);
      }
      return normalized;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt >= MAX_PARSE_RETRIES) break;

      messages.push(response);
      messages.push({
        role: "user",
        content: `Your previous output failed to parse:\n\n${lastError.message}\n\nRegenerate the JSON object with the issue fixed. Output ONLY the JSON, starting with \`{\`.`,
        timestamp: Date.now(),
      });
    }
  }

  throw new Error(
    `spec-import: failed to produce a valid spec after ${MAX_PARSE_RETRIES + 1} attempts: ${
      lastError?.message ?? "unknown error"
    }\n\nLast raw LLM output:\n${lastRaw}`,
    lastError != null ? { cause: lastError } : undefined,
  );
};
