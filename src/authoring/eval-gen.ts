import { complete } from "@mariozechner/pi-ai";
import type { Context } from "@mariozechner/pi-ai";
import type { AnyModel } from "../agent/provider.js";
import { buildEvalGenPrompt } from "./prompts.js";
import { lintEvalYaml } from "../eval/linter.js";

/**
 * Generate eval YAML content from a SKILL.md file using an LLM.
 * Runs the eval linter to auto-fix common issues (regex flags, timeouts, etc.)
 * before returning. Throws if there are unfixable errors.
 */
export const generateEvalYaml = async (
  model: AnyModel,
  skillMdContent: string,
): Promise<string> => {
  const context: Context = {
    systemPrompt: buildEvalGenPrompt(),
    messages: [
      {
        role: "user",
        content: `Here is the SKILL.md file:\n\n${skillMdContent}`,
        timestamp: Date.now(),
      },
    ],
  };

  const response = await complete(model, context);

  const text = response.content
    .filter((b): b is { type: "text"; text: string; textSignature?: string } => b.type === "text")
    .map((b) => b.text)
    .join("");

  const raw = stripFences(text.trim());

  // Run linter — auto-fix what we can
  const lint = lintEvalYaml(raw);

  if (lint.fixes.length > 0) {
    for (const fix of lint.fixes) {
      console.log(`\x1b[2m    lint fix: ${fix.message}\x1b[0m`);
    }
  }

  if (lint.errors.length > 0) {
    const errorSummary = lint.errors.map((e) => `  ${e.path}: ${e.message}`).join("\n");
    throw new Error(`Generated eval YAML has unfixable errors:\n${errorSummary}`);
  }

  return lint.fixedYaml ?? raw;
};

const stripFences = (text: string): string => {
  const fenceMatch = /^```(?:ya?ml)?\s*\n([\s\S]*?)\n```$/i.exec(text);
  if (fenceMatch?.[1] != null) {
    return fenceMatch[1].trim();
  }
  return text;
};
