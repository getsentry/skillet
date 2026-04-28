import type { Context, Message } from "@mariozechner/pi-ai";
import { completeWithBackoff } from "../../agent/complete-with-backoff.js";
import type { AnyModel } from "../../agent/provider.js";
import { parseSpecJson, uniqueSlug, validateSpecObject, type SkillSpec } from "../../spec/index.js";
import { buildSpecInitPrompt } from "../prompts/spec-init.js";

const stripFences = (text: string): string => {
  const fence = /^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/i.exec(text.trim());
  return fence?.[1]?.trim() ?? text.trim();
};

const MAX_PARSE_RETRIES = 2;

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
 * Output is JSON (not YAML) to avoid ambiguous quoting on
 * statements containing colons, backticks, etc. Retries up to
 * `MAX_PARSE_RETRIES` times on parse failure, feeding the parser
 * error back to the LLM so it can fix the specific malformation.
 *
 * Throws if the LLM produces output that can't be parsed even after
 * retries, or fails structural validation after normalization. The
 * caller (the `spec init` command) surfaces the error.
 */
export const runSpecInit = async (model: AnyModel, description: string): Promise<SkillSpec> => {
  const messages: Message[] = [
    {
      role: "user",
      content: `Create a spec for the following skill:\n\n${description}`,
      timestamp: Date.now(),
    },
  ];

  let lastRaw = "";
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_PARSE_RETRIES; attempt++) {
    const context: Context = { systemPrompt: buildSpecInitPrompt(), messages };
    const response = await completeWithBackoff(model, context);
    if (response.stopReason === "error") {
      const errMsg = response.errorMessage ?? "unknown error";
      throw new Error(`spec-init: LLM returned error: ${errMsg}`);
    }

    lastRaw = stripFences(extractText(response));
    try {
      const spec = parseSpecJson(lastRaw, "spec-init output");
      const normalized = normalize(spec);
      const validation = validateSpecObject(normalized, "spec-init output");
      if (!validation.valid) {
        const summary = validation.errors.map((e) => `- ${e.message}`).join("\n");
        throw new Error(`structural validation failed:\n${summary}`);
      }
      return normalized;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt >= MAX_PARSE_RETRIES) break;

      // Feed the error back to the LLM so it can fix the specific
      // problem (e.g. an unquoted character that broke JSON.parse).
      messages.push(response);
      messages.push({
        role: "user",
        content: `Your previous output failed to parse:\n\n${lastError.message}\n\nRegenerate the JSON object with the issue fixed. Output ONLY the JSON, starting with \`{\`.`,
        timestamp: Date.now(),
      });
    }
  }

  throw new Error(
    `spec-init: failed to produce a valid spec after ${MAX_PARSE_RETRIES + 1} attempts: ${
      lastError?.message ?? "unknown error"
    }\n\nLast raw LLM output:\n${lastRaw}`,
    lastError != null ? { cause: lastError } : undefined,
  );
};
