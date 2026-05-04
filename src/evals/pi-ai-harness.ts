/**
 * Thin wrapper over upstream `piAiHarness` that injects a default
 * `prompt: HarnessPrompt`.
 *
 * Beta.3 made `prompt` required on the harness so LLM-backed judges
 * can share a model seam with the harness instead of bringing their
 * own LLM client. Skillet's own `criterionJudge` uses skillet's
 * judge model directly and does NOT use this seam, but we still
 * have to provide one for the type to be satisfied. Callers (or
 * generated eval files) can override by passing their own `prompt`.
 */
import type { Context } from "@mariozechner/pi-ai";
import { piAiHarness as upstreamPiAiHarness } from "@vitest-evals/harness-pi-ai";
import type { Harness, HarnessMetadata, HarnessPrompt } from "vitest-evals";
import { completeWithBackoff } from "../agent/complete-with-backoff.js";
import { resolveModels } from "../agent/provider.js";
import { submitAiJob } from "../agent/queue.js";

const defaultPrompt: HarnessPrompt = async (input, options) => {
  const model = resolveModels().judge;
  const context: Context = {
    ...(options?.system != null ? { systemPrompt: options.system } : {}),
    messages: [{ role: "user", content: input, timestamp: Date.now() }],
  };
  const response = await submitAiJob({
    name: "harness-prompt",
    run: (signal) => completeWithBackoff(model, context, { maxTokens: 1000, signal }),
  });
  return response.content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("");
};

type UpstreamOptions = Parameters<typeof upstreamPiAiHarness>[0];
type SkilletPiAiHarnessOptions = Omit<UpstreamOptions, "prompt"> & {
  prompt?: HarnessPrompt;
};

/**
 * Build a `piAiHarness` with a skillet default `prompt` seam. Pass
 * `prompt` to override; everything else is forwarded verbatim.
 */
export const piAiHarness = <TInput = string, TMetadata extends HarnessMetadata = HarnessMetadata>(
  options: SkilletPiAiHarnessOptions,
): Harness<TInput, TMetadata> => {
  const merged = { prompt: defaultPrompt, ...options } as UpstreamOptions;
  return upstreamPiAiHarness(merged) as Harness<TInput, TMetadata>;
};
