import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Context } from "@mariozechner/pi-ai";
import { completeWithBackoff } from "../../agent/complete-with-backoff.js";
import type { AnyModel } from "../../agent/provider.js";
import type { ReferenceDoc, SkillSpec } from "../../spec/index.js";
import { buildReferenceGenPrompt } from "../prompts/reference-gen.js";
import { extractText, stripFences } from "./_text.js";

export const REFERENCE_MD_BANNER = `<!--
  Generated initially from spec.yaml; durable after that. Edit this
  reference directly to improve domain depth. Skillet regenerates
  only missing reference files.
-->
`;

export interface RunReferenceGenResult {
  written: string[];
  skipped: string[];
}

const renderReference = async (
  model: AnyModel,
  spec: SkillSpec,
  reference: ReferenceDoc,
): Promise<string> => {
  const context: Context = {
    systemPrompt: buildReferenceGenPrompt(),
    messages: [
      {
        role: "user",
        content: `Write this reference file.\n\n\`\`\`json\n${JSON.stringify(
          {
            spec: {
              name: spec.name,
              intent: spec.intent,
              triggers: spec.triggers,
              behaviors: spec.behaviors,
              must_not: spec.must_not,
              references: spec.references ?? [],
            },
            reference,
          },
          null,
          2,
        )}\n\`\`\``,
        timestamp: Date.now(),
      },
    ],
  };

  const response = await completeWithBackoff(model, context, { maxTokens: 5000 });
  if (response.stopReason === "error") {
    throw new Error(`reference-gen: LLM returned error: ${response.errorMessage ?? "unknown"}`);
  }
  const markdown = stripFences(extractText(response).trim(), "any");
  return `${REFERENCE_MD_BANNER}\n${markdown.trim()}\n`;
};

export const runReferenceGen = async (
  model: AnyModel,
  spec: SkillSpec,
  skillRoot: string,
  opts: { logProgress?: ((msg: string) => void) | undefined } = {},
): Promise<RunReferenceGenResult> => {
  const written: string[] = [];
  const skipped: string[] = [];
  const references = spec.references ?? [];

  if (references.length === 0) {
    return { written, skipped };
  }

  for (const reference of references) {
    const filePath = join(skillRoot, reference.path);
    if (existsSync(filePath)) {
      skipped.push(reference.path);
      continue;
    }
    opts.logProgress?.(`rendering ${reference.path}`);
    mkdirSync(dirname(filePath), { recursive: true });
    const content = await renderReference(model, spec, reference);
    writeFileSync(filePath, content, "utf-8");
    written.push(filePath);
    opts.logProgress?.(`wrote ${filePath}`);
  }

  return { written, skipped };
};
