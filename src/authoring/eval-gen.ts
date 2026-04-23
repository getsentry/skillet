import { complete } from "@mariozechner/pi-ai";
import type { Context } from "@mariozechner/pi-ai";
import type { AnyModel } from "../agent/provider.js";
import { buildEvalGenPrompt } from "./prompts.js";

/**
 * Generate eval YAML content from a SKILL.md file using an LLM.
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

  // Strip markdown fences if the model wraps the output
  return stripFences(text.trim());
};

const stripFences = (text: string): string => {
  const fenceMatch = /^```(?:ya?ml)?\s*\n([\s\S]*?)\n```$/i.exec(text);
  if (fenceMatch?.[1] != null) {
    return fenceMatch[1].trim();
  }
  return text;
};
