import { getModel, getEnvApiKey } from "@mariozechner/pi-ai";
import type { Model } from "@mariozechner/pi-ai";

/**
 * Model type alias used throughout skillkit. We don't care about the specific
 * API the model implements, only that it's a Model — so we parameterise on the
 * base `string` API type (which satisfies `Api = KnownApi | (string & {})`).
 */
export type AnyModel = Model<string>;

/**
 * Loose-typed wrapper around getModel. pi-ai's `getModel` is typed against a
 * generated registry of (provider, modelId) literal unions, which rejects
 * arbitrary strings at compile time even though the runtime implementation
 * accepts any pair. We intentionally erase those generics here so callers can
 * pass values parsed from env vars without cluttering every call site with
 * casts.
 */
const getModelLoose: (provider: string, modelId: string) => AnyModel =
  // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- pi-ai's registry-based generics don't model the runtime behaviour of getModel; see comment above.
  getModel as unknown as (provider: string, modelId: string) => AnyModel;

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
export const resolveModels = (): {
  agent: AnyModel;
  judge: AnyModel;
} => {
  const agentModel = resolveModel(
    process.env.SKILLKIT_MODEL !== undefined && process.env.SKILLKIT_MODEL !== ""
      ? process.env.SKILLKIT_MODEL
      : undefined,
  );
  const judgeModel =
    process.env.SKILLKIT_JUDGE_MODEL !== undefined && process.env.SKILLKIT_JUDGE_MODEL !== ""
      ? resolveModel(process.env.SKILLKIT_JUDGE_MODEL)
      : agentModel;

  return { agent: agentModel, judge: judgeModel };
};

const resolveModel = (explicit?: string): AnyModel => {
  if (explicit != null && explicit !== "") {
    // Format: "provider/model-id" e.g. "anthropic/claude-sonnet-4-20250514"
    const [provider, ...rest] = explicit.split("/");
    if (provider == null || provider === "") {
      throw new Error(`Invalid SKILLKIT_MODEL "${explicit}". Use format "provider/model-id".`);
    }
    const modelId = rest.join("/");
    const resolvedModelId = modelId !== "" ? modelId : getDefaultModelId(provider);

    return getModelLoose(provider, resolvedModelId);
  }

  // Auto-detect from environment
  if (getEnvApiKey("anthropic") != null) {
    return getModelLoose("anthropic", "claude-sonnet-4-20250514");
  }

  if (getEnvApiKey("openai") != null) {
    return getModelLoose("openai", "gpt-4o");
  }

  throw new Error(
    "No LLM provider configured. Set one of:\n" +
      "  ANTHROPIC_API_KEY\n" +
      "  OPENAI_API_KEY\n" +
      "  SKILLKIT_MODEL=provider/model-id",
  );
};

const getDefaultModelId = (provider: string): string => {
  switch (provider) {
    case "anthropic":
      return "claude-sonnet-4-20250514";
    case "openai":
      return "gpt-4o";
    case "google":
      return "gemini-2.5-flash";
    default:
      throw new Error(`Unknown provider "${provider}". Use format "provider/model-id".`);
  }
};
