import type { LanguageModel } from "ai";

/**
 * Auto-detect and create an LLM provider from environment variables.
 *
 * Priority:
 *  1. SKILLKIT_MODEL (explicit override)
 *  2. ANTHROPIC_API_KEY → anthropic/claude-sonnet-4-20250514
 *  3. OPENAI_API_KEY → openai/gpt-4o
 *
 * Returns both an agent model and a judge model (judge can be overridden
 * separately via SKILLKIT_JUDGE_MODEL).
 */
export async function resolveModels(): Promise<{
  agent: LanguageModel;
  judge: LanguageModel;
}> {
  const agentModel = await resolveModel(
    process.env.SKILLKIT_MODEL || undefined
  );
  const judgeModel = process.env.SKILLKIT_JUDGE_MODEL
    ? await resolveModel(process.env.SKILLKIT_JUDGE_MODEL)
    : agentModel;

  return { agent: agentModel, judge: judgeModel };
}

async function resolveModel(explicit?: string): Promise<LanguageModel> {
  if (explicit) {
    // Format: "provider/model-id" e.g. "anthropic/claude-sonnet-4-20250514"
    const [provider, ...rest] = explicit.split("/");
    const modelId = rest.join("/");

    if (provider === "anthropic") {
      const { createAnthropic } = await import("@ai-sdk/anthropic");
      return createAnthropic()(modelId || "claude-sonnet-4-20250514");
    }
    if (provider === "openai") {
      const { createOpenAI } = await import("@ai-sdk/openai");
      return createOpenAI()(modelId || "gpt-4o");
    }
    throw new Error(`Unknown provider "${provider}" in model string "${explicit}"`);
  }

  // Auto-detect from environment
  if (process.env.ANTHROPIC_API_KEY) {
    const { createAnthropic } = await import("@ai-sdk/anthropic");
    return createAnthropic()("claude-sonnet-4-20250514");
  }

  if (process.env.OPENAI_API_KEY) {
    const { createOpenAI } = await import("@ai-sdk/openai");
    return createOpenAI()("gpt-4o");
  }

  throw new Error(
    "No LLM provider configured. Set one of:\n" +
      "  ANTHROPIC_API_KEY\n" +
      "  OPENAI_API_KEY\n" +
      "  SKILLKIT_MODEL=provider/model-id"
  );
}
