import { getModel, getEnvApiKey } from "@mariozechner/pi-ai";
import type { Model } from "@mariozechner/pi-ai";

/**
 * Auto-detect and create an LLM model from environment variables.
 *
 * Priority:
 *  1. SKILLKIT_MODEL (explicit override, format: "provider/model-id")
 *  2. ANTHROPIC_API_KEY → anthropic/claude-sonnet-4-20250514
 *  3. OPENAI_API_KEY → openai/gpt-4o
 *
 * Returns both an agent model and a judge model (judge can be overridden
 * separately via SKILLKIT_JUDGE_MODEL).
 */
export function resolveModels(): {
  agent: Model<any>;
  judge: Model<any>;
} {
  const agentModel = resolveModel(
    process.env.SKILLKIT_MODEL || undefined
  );
  const judgeModel = process.env.SKILLKIT_JUDGE_MODEL
    ? resolveModel(process.env.SKILLKIT_JUDGE_MODEL)
    : agentModel;

  return { agent: agentModel, judge: judgeModel };
}

function resolveModel(explicit?: string): Model<any> {
  if (explicit) {
    // Format: "provider/model-id" e.g. "anthropic/claude-sonnet-4-20250514"
    const [provider, ...rest] = explicit.split("/");
    const modelId = rest.join("/");

    return getModel(
      provider as any,
      (modelId || getDefaultModelId(provider)) as any
    );
  }

  // Auto-detect from environment
  if (getEnvApiKey("anthropic")) {
    return getModel("anthropic", "claude-sonnet-4-20250514");
  }

  if (getEnvApiKey("openai")) {
    return getModel("openai", "gpt-4o");
  }

  throw new Error(
    "No LLM provider configured. Set one of:\n" +
      "  ANTHROPIC_API_KEY\n" +
      "  OPENAI_API_KEY\n" +
      "  SKILLKIT_MODEL=provider/model-id"
  );
}

function getDefaultModelId(provider: string): string {
  switch (provider) {
    case "anthropic":
      return "claude-sonnet-4-20250514";
    case "openai":
      return "gpt-4o";
    case "google":
      return "gemini-2.5-flash";
    default:
      throw new Error(
        `Unknown provider "${provider}". Use format "provider/model-id".`
      );
  }
}
