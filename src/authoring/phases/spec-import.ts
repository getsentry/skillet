import type { Context, Message } from "@mariozechner/pi-ai";
import { completeWithBackoff } from "../../agent/complete-with-backoff.js";
import type { AnyModel } from "../../agent/provider.js";
import { parseFrontmatter } from "../../skill/loader.js";
import { parseSpecJson, uniqueSlug, validateSpecObject, type SkillSpec } from "../../spec/index.js";
import { buildSpecImportPrompt } from "../prompts/spec-import.js";
import { extractText, stripFences } from "./_text.js";

const SLUG_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const MAX_PARSE_RETRIES = 2;

/** Frontmatter keys that skillet's typed schema covers — anything
 *  else gets passed through opaquely as `frontmatter_extras`. */
const KNOWN_FRONTMATTER_KEYS = new Set(["name", "description"]);

/**
 * Pluck unknown SKILL.md frontmatter keys (e.g. `allowed-tools`,
 * `argument-hint`, `model`) from the source content so they survive
 * the import → regen round-trip. Skillet's typed fields stay in the
 * structured spec; everything else lives under frontmatter_extras
 * and is rendered back into the regenerated SKILL.md.
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
 * Run the spec-import phase: SKILL.md content → SkillSpec.
 *
 * Output is JSON (not YAML) for the same reason as spec-init: skill
 * statements often contain characters that break YAML quoting.
 * Retries up to `MAX_PARSE_RETRIES` times on parse failure with the
 * parser error fed back to the LLM.
 */
export const runSpecImport = async (
  model: AnyModel,
  skillMdContent: string,
): Promise<SkillSpec> => {
  const messages: Message[] = [
    {
      role: "user",
      content: `## SKILL.md\n\n${skillMdContent}`,
      timestamp: Date.now(),
    },
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
      // Capture unknown frontmatter keys from the source SKILL.md so
      // the regenerated frontmatter doesn't lose them. The LLM never
      // sees these — skillet handles them mechanically.
      const extras = captureFrontmatterExtras(skillMdContent);
      if (extras != null) {
        normalized.frontmatter_extras = extras;
      }
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
