import { complete } from "@mariozechner/pi-ai";
import type { Context, Message } from "@mariozechner/pi-ai";
import type { AnyModel } from "../agent/provider.js";
import { buildEvalGenPrompt } from "./prompts.js";
import { lintEvalYaml, LOAD_BEARING_RULES, type LintFix } from "../eval/linter.js";

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

const formatWarnings = (warnings: LintFix[]): string => {
  return warnings.map((w) => `- ${w.path}: ${w.message}`).join("\n");
};

/**
 * Run an LLM generation + lint loop with retries. Load-bearing lint
 * warnings are fed back to the model for a fix; if they persist after
 * MAX_RETRIES, they escalate to errors and this throws. Auto-fixes
 * (timeout bounds, regex flags) are applied silently each iteration.
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
    const response = await complete(model, context);

    if (response.stopReason === "error") {
      const errMsg = response.errorMessage ?? "unknown error";
      throw new Error(`LLM returned error: ${errMsg}`);
    }

    const text = extractText(response);
    const raw = stripFences(text.trim());
    const lint = lintEvalYaml(raw);

    if (lint.errors.length > 0) {
      const summary = lint.errors.map((e) => `  ${e.path}: ${e.message}`).join("\n");
      throw new Error(`Generated eval YAML has unfixable errors:\n${summary}`);
    }

    // Log auto-applied fixes every attempt
    for (const fix of lint.fixes.filter((f) => f.autoFixed)) {
      logProgress?.(`lint fix: ${fix.message}`);
    }

    const loadBearing = lint.fixes.filter((f) => !f.autoFixed && LOAD_BEARING_RULES.has(f.rule));

    if (loadBearing.length === 0) {
      // Log advisory-only warnings (non-load-bearing) so authors see them
      for (const fix of lint.fixes.filter((f) => !f.autoFixed && !LOAD_BEARING_RULES.has(f.rule))) {
        logProgress?.(`lint warning: ${fix.message}`);
      }
      return lint.fixedYaml ?? raw;
    }

    if (attempt >= MAX_RETRIES) {
      throw new Error(
        `Generator produced YAML with load-bearing lint warnings after ${MAX_RETRIES} retries. This is a generator bug — check the gen prompt:\n${formatWarnings(loadBearing)}`,
      );
    }

    logProgress?.(
      `retry ${attempt + 1}/${MAX_RETRIES}: ${loadBearing.length} load-bearing warning(s), regenerating`,
    );
    messages.push(response);
    messages.push({
      role: "user",
      content: `Your previous YAML has these issues that must be fixed:\n\n${formatWarnings(loadBearing)}\n\nRegenerate the YAML with these fixes applied. Output ONLY the corrected YAML, same format as before.`,
      timestamp: Date.now(),
    });
  }

  throw new Error("unreachable");
};

/**
 * Generate eval YAML content from a SKILL.md file using an LLM.
 * Runs the lint+retry loop; load-bearing warnings throw after retries.
 */
export const generateEvalYaml = async (
  model: AnyModel,
  skillMdContent: string,
): Promise<string> => {
  return generateEvalYamlWithRetry({
    model,
    systemPrompt: buildEvalGenPrompt(),
    initialUserContent: `Here is the SKILL.md file:\n\n${skillMdContent}`,
    logProgress: (msg) => {
      console.log(`\x1b[2m    ${msg}\x1b[0m`);
    },
  });
};
