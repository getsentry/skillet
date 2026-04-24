import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir, platform } from "node:os";
import { getModel, getEnvApiKey } from "@mariozechner/pi-ai";
import type { Model } from "@mariozechner/pi-ai";

/**
 * Model type alias used throughout skillet. We don't care about the specific
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
 * Providers to try for auto-detection, in preference order.
 * Each entry maps a provider name to:
 *   - The default model to use
 *   - Extra env vars to check beyond what pi-ai's getEnvApiKey handles
 *
 * When running inside an agent (Claude Code, Codex, Copilot, Gemini CLI),
 * the host agent's auth token is typically inherited via environment.
 * We check these so `skillet` just works without extra configuration.
 */
const PROVIDER_AUTODISCOVERY: Array<{
  provider: string;
  defaultModel: string;
  extraEnvVars?: string[];
}> = [
  {
    provider: "anthropic",
    defaultModel: "claude-opus-4-7",
    // Claude Code sets these for OAuth/subscription users
    extraEnvVars: ["ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN"],
  },
  {
    provider: "openai",
    defaultModel: "gpt-4o",
    // Codex CLI uses CODEX_API_KEY for exec mode
    extraEnvVars: ["CODEX_API_KEY"],
  },
  {
    provider: "github-copilot",
    defaultModel: "gpt-4o",
    // Copilot tokens — pi-ai already checks COPILOT_GITHUB_TOKEN, GH_TOKEN, GITHUB_TOKEN
  },
  {
    provider: "google",
    defaultModel: "gemini-2.5-flash",
  },
  {
    provider: "google-gemini-cli",
    defaultModel: "gemini-2.5-flash",
  },
  {
    provider: "openrouter",
    defaultModel: "anthropic/claude-sonnet-4",
  },
  {
    provider: "groq",
    defaultModel: "llama-3.3-70b-versatile",
  },
  {
    provider: "xai",
    defaultModel: "grok-3-mini",
  },
  {
    provider: "mistral",
    defaultModel: "mistral-large-latest",
  },
  {
    provider: "cerebras",
    defaultModel: "llama-3.3-70b",
  },
];

const isRecord = (v: unknown): v is Record<string, unknown> => {
  return v != null && typeof v === "object" && !Array.isArray(v);
};

const envVarIsSet = (name: string): boolean => {
  const val = process.env[name];
  return val != null && val !== "";
};

/**
 * Auto-detect and create an LLM model from environment variables.
 *
 * Priority:
 *  1. SKILLET_MODEL / SKILLKIT_MODEL (explicit override, format: "provider/model-id")
 *  2. Auto-discovery: loop through known providers, check pi-ai's getEnvApiKey
 *     plus extra env vars for agent-inherited tokens (Claude Code, Codex, Copilot)
 *
 * Returns both an agent model and a judge model (judge can be overridden
 * separately via SKILLET_JUDGE_MODEL / SKILLKIT_JUDGE_MODEL).
 */
export const resolveModels = (): {
  agent: AnyModel;
  judge: AnyModel;
} => {
  const explicitModel = process.env.SKILLET_MODEL ?? process.env.SKILLKIT_MODEL;
  const explicitJudge = process.env.SKILLET_JUDGE_MODEL ?? process.env.SKILLKIT_JUDGE_MODEL;

  const agentModel = resolveModel(
    explicitModel != null && explicitModel !== "" ? explicitModel : undefined,
  );
  const judgeModel =
    explicitJudge != null && explicitJudge !== "" ? resolveModel(explicitJudge) : agentModel;

  return { agent: agentModel, judge: judgeModel };
};

const resolveModel = (explicit?: string): AnyModel => {
  if (explicit != null && explicit !== "") {
    // Format: "provider/model-id" e.g. "anthropic/claude-sonnet-4-20250514"
    const [provider, ...rest] = explicit.split("/");
    if (provider == null || provider === "") {
      throw new Error(`Invalid model string "${explicit}". Use format "provider/model-id".`);
    }
    const modelId = rest.join("/");
    const resolvedModelId = modelId !== "" ? modelId : getDefaultModelId(provider);

    return getModelLoose(provider, resolvedModelId);
  }

  // Auto-discover from environment
  return autoDiscover();
};

/**
 * Try to read the Claude Code OAuth token from macOS Keychain.
 * Claude Code stores credentials under service "Claude Code-credentials"
 * with a JSON blob containing { claudeAiOauth: { accessToken, ... } }.
 *
 * Returns the access token string, or undefined if unavailable.
 */
/**
 * Try to read the Claude Code OAuth token from macOS Keychain.
 * Claude Code stores credentials under service "Claude Code-credentials"
 * with a JSON blob containing { claudeAiOauth: { accessToken, ... } }.
 */
const readClaudeCodeKeychainToken = (): string | undefined => {
  if (platform() !== "darwin") {
    return undefined;
  }

  try {
    const raw = execSync('security find-generic-password -s "Claude Code-credentials" -w', {
      stdio: "pipe",
      timeout: 5_000,
    })
      .toString()
      .trim();

    const parsed: unknown = JSON.parse(raw);
    return extractClaudeOAuthToken(parsed);
  } catch {
    // Keychain unavailable, locked, or entry doesn't exist
    return undefined;
  }
};

/**
 * Helper to extract claudeAiOauth.accessToken from a parsed JSON blob.
 * Checks expiry — returns undefined if the token is expired.
 */
const extractClaudeOAuthToken = (parsed: unknown): string | undefined => {
  if (parsed == null || typeof parsed !== "object" || !("claudeAiOauth" in parsed)) {
    return undefined;
  }
  const oauth = (parsed as Record<string, unknown>).claudeAiOauth;
  if (oauth == null || typeof oauth !== "object" || !("accessToken" in oauth)) {
    return undefined;
  }
  const obj = oauth as Record<string, unknown>;

  // Check expiry if present
  if (typeof obj.expiresAt === "number" && obj.expiresAt < Date.now()) {
    return undefined;
  }

  const token = obj.accessToken;
  return typeof token === "string" && token !== "" ? token : undefined;
};

/**
 * Read Claude Code OAuth from ~/.claude/.credentials.json (Linux / fallback).
 * On Linux, Claude Code writes credentials to this file instead of a system keychain.
 */
const readClaudeCodeCredentialsFile = (): string | undefined => {
  try {
    const credPath = join(homedir(), ".claude", ".credentials.json");
    if (!existsSync(credPath)) {
      return undefined;
    }
    const raw = readFileSync(credPath, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    return extractClaudeOAuthToken(parsed);
  } catch {
    return undefined;
  }
};

/**
 * Read OpenAI Codex credentials from ~/.codex/auth.json.
 * The Codex CLI stores OAuth tokens and API keys here after `codex login`.
 */
const readCodexAuthFile = (): string | undefined => {
  try {
    const authPath = join(homedir(), ".codex", "auth.json");
    if (!existsSync(authPath)) {
      return undefined;
    }
    const raw = readFileSync(authPath, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return undefined;
    }

    // Codex auth.json may have { token: "...", api_key: "...", ... }
    // Try common key names
    for (const key of ["api_key", "token", "access_token", "apiKey"]) {
      const val = parsed[key];
      if (typeof val === "string" && val !== "") {
        return val;
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
};

const autoDiscover = (): AnyModel => {
  for (const entry of PROVIDER_AUTODISCOVERY) {
    // Check pi-ai's built-in env var detection
    if (getEnvApiKey(entry.provider) != null) {
      return getModelLoose(entry.provider, entry.defaultModel);
    }

    // Check extra env vars (agent-inherited tokens)
    if (entry.extraEnvVars != null) {
      for (const envVar of entry.extraEnvVars) {
        if (envVarIsSet(envVar)) {
          return getModelLoose(entry.provider, entry.defaultModel);
        }
      }
    }
  }

  // Credential file fallbacks — for when env vars are scrubbed by the host agent
  // but the user has authenticated via the host's login flow.

  // Claude Code: macOS Keychain or ~/.claude/.credentials.json
  const claudeToken = readClaudeCodeKeychainToken() ?? readClaudeCodeCredentialsFile();
  if (claudeToken != null) {
    process.env.ANTHROPIC_API_KEY = claudeToken;
    return getModelLoose("anthropic", "claude-opus-4-7");
  }

  // OpenAI Codex: ~/.codex/auth.json
  const codexToken = readCodexAuthFile();
  if (codexToken != null) {
    process.env.OPENAI_API_KEY = codexToken;
    return getModelLoose("openai", "gpt-4o");
  }

  throw new Error(
    "No LLM provider detected. Skillet checks these automatically:\n" +
      "  ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / CLAUDE_CODE_OAUTH_TOKEN\n" +
      "  OPENAI_API_KEY / CODEX_API_KEY\n" +
      "  COPILOT_GITHUB_TOKEN / GH_TOKEN / GITHUB_TOKEN\n" +
      "  GEMINI_API_KEY\n" +
      "  OPENROUTER_API_KEY / GROQ_API_KEY / XAI_API_KEY / MISTRAL_API_KEY\n" +
      "  macOS Keychain (Claude Code OAuth)\n" +
      "  ~/.claude/.credentials.json (Claude Code on Linux)\n" +
      "  ~/.codex/auth.json (OpenAI Codex)\n\n" +
      "Or set SKILLET_MODEL=provider/model-id explicitly.",
  );
};

const getDefaultModelId = (provider: string): string => {
  const entry = PROVIDER_AUTODISCOVERY.find((e) => e.provider === provider);
  if (entry != null) {
    return entry.defaultModel;
  }
  throw new Error(
    `Unknown provider "${provider}". Known providers: ${PROVIDER_AUTODISCOVERY.map((e) => e.provider).join(", ")}`,
  );
};
