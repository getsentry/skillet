/**
 * Shared text helpers used across authoring phases.
 *
 * These functions were previously copy-pasted into every phase file.
 * Centralising them removes ~80 lines of duplication and prevents
 * drift between phases when the LLM-output format conventions change
 * (e.g. when we switched spec output from YAML to JSON).
 */

/**
 * Strip a leading ```json or ```yaml fence (or any plain ``` fence)
 * from an LLM response, returning the inner content. The LLM is
 * told to emit raw output without fences, but consistently does so
 * about 95% of the time — defending against the other 5% is cheap.
 *
 * Pass `lang` to bias the regex toward a specific fence label; the
 * default accepts any label (or none).
 */
export const stripFences = (text: string, lang: "json" | "yaml" | "any" = "any"): string => {
  const trimmed = text.trim();
  const langPattern = lang === "json" ? "(?:json)?" : lang === "yaml" ? "(?:ya?ml)?" : "[a-z]*";
  const fenceRe = new RegExp(`^\`\`\`${langPattern}\\s*\\n([\\s\\S]*?)\\n\`\`\`\\s*$`, "i");
  const match = fenceRe.exec(trimmed);
  return match?.[1]?.trim() ?? trimmed;
};

/**
 * Extract concatenated text from a pi-ai assistant response. Filters
 * out tool-call blocks and similar non-text content via type-guard
 * narrowing (no `as` cast).
 */
export const extractText = (response: { content: unknown[] }): string => {
  return response.content
    .filter((b): b is { type: "text"; text: string; textSignature?: string } => {
      return typeof b === "object" && b != null && (b as { type?: unknown }).type === "text";
    })
    .map((b) => b.text)
    .join("");
};

/**
 * Plain-object guard. Used by every JSON-shaped LLM-output validator
 * to narrow `unknown` to `Record<string, unknown>` without an
 * unsafe `as` cast.
 */
export const isRecord = (val: unknown): val is Record<string, unknown> => {
  return val != null && typeof val === "object" && !Array.isArray(val);
};
