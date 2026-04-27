import type { Context, Message } from "@mariozechner/pi-ai";
import type { AnyModel } from "../agent/provider.js";
import { completeWithBackoff } from "../agent/complete-with-backoff.js";
import { lintEvalYaml, LOAD_BEARING_RULES, type LintError, type LintFix } from "../eval/linter.js";

const MAX_RETRIES = 2;

const stripFences = (text: string): string => {
  const fenceMatch = /^```(?:ya?ml)?\s*\n([\s\S]*?)\n```$/i.exec(text);
  if (fenceMatch?.[1] != null) {
    return fenceMatch[1].trim();
  }
  return text;
};

const extractText = (response: { content: unknown[] }): string => {
  return response.content
    .filter((b): b is { type: "text"; text: string; textSignature?: string } => {
      return typeof b === "object" && b != null && (b as { type?: unknown }).type === "text";
    })
    .map((b) => b.text)
    .join("");
};

const formatItems = (items: Array<{ path: string; message: string }>): string => {
  return items.map((w) => `- ${w.path}: ${w.message}`).join("\n");
};

/**
 * Run an LLM generation + lint loop with retries. Both lint errors
 * (parse failures, hard-rule violations) and load-bearing lint warnings
 * are fed back to the model for a fix; if they persist after
 * MAX_RETRIES, this throws. Auto-fixes (timeout bounds, regex flags,
 * POSIX classes) are applied silently each iteration.
 *
 * Shared between `generateEvalYaml` (full eval file) and `add-eval`
 * (partial cases), since both need the same push-back semantics.
 */
export const generateEvalYamlWithRetry = async (opts: {
  model: AnyModel;
  systemPrompt: string;
  initialUserContent: string;
  logProgress?: (msg: string) => void;
}): Promise<string> => {
  const { model, systemPrompt, initialUserContent, logProgress } = opts;

  const messages: Message[] = [
    { role: "user", content: initialUserContent, timestamp: Date.now() },
  ];

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const context: Context = { systemPrompt, messages };
    const response = await completeWithBackoff(model, context);

    if (response.stopReason === "error") {
      const errMsg = response.errorMessage ?? "unknown error";
      throw new Error(`LLM returned error: ${errMsg}`);
    }

    const text = extractText(response);
    const raw = stripFences(text.trim());
    const lint = lintEvalYaml(raw);

    // Log auto-applied fixes every attempt
    for (const fix of lint.fixes.filter((f) => f.autoFixed)) {
      logProgress?.(`lint fix: ${fix.message}`);
    }

    const errors: LintError[] = lint.errors;
    const loadBearing: LintFix[] = lint.fixes.filter(
      (f) => !f.autoFixed && LOAD_BEARING_RULES.has(f.rule),
    );

    if (errors.length === 0 && loadBearing.length === 0) {
      // Log advisory-only warnings (non-load-bearing) so authors see them
      for (const fix of lint.fixes.filter((f) => !f.autoFixed && !LOAD_BEARING_RULES.has(f.rule))) {
        logProgress?.(`lint warning: ${fix.message}`);
      }
      return lint.fixedYaml ?? raw;
    }

    if (attempt >= MAX_RETRIES) {
      const summary = [
        errors.length > 0 ? `Errors:\n${formatItems(errors)}` : "",
        loadBearing.length > 0 ? `Load-bearing warnings:\n${formatItems(loadBearing)}` : "",
      ]
        .filter((s) => s !== "")
        .join("\n\n");
      throw new Error(
        `Generator failed to produce valid YAML after ${MAX_RETRIES} retries. This is a generator bug — check the gen prompt:\n\n${summary}`,
      );
    }

    const issueCount = errors.length + loadBearing.length;
    const kind = errors.length > 0 ? "error(s)" : "warning(s)";
    logProgress?.(`retry ${attempt + 1}/${MAX_RETRIES}: ${issueCount} ${kind}, regenerating`);
    messages.push(response);
    const issuesBlock = [
      errors.length > 0 ? `Errors (must fix):\n${formatItems(errors)}` : "",
      loadBearing.length > 0
        ? `Load-bearing warnings (must fix):\n${formatItems(loadBearing)}`
        : "",
    ]
      .filter((s) => s !== "")
      .join("\n\n");
    messages.push({
      role: "user",
      content: `Your previous YAML has these issues that must be fixed:\n\n${issuesBlock}\n\nRegenerate the YAML with these fixes applied. Output ONLY the corrected YAML, same format as before.`,
      timestamp: Date.now(),
    });
  }

  throw new Error("unreachable");
};
