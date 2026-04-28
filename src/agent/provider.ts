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
 *  1. SKILLET_MODEL (explicit override, format: "provider/model-id")
 *  2. Auto-discovery: loop through known providers, check pi-ai's getEnvApiKey
 *     plus extra env vars for agent-inherited tokens (Claude Code, Codex, Copilot)
 *
 * Returns both an agent model and a judge model (judge can be overridden
 * separately via SKILLET_JUDGE_MODEL).
 */
export const resolveModels = (): {
  agent: AnyModel;
  judge: AnyModel;
} => {
  const explicitModel = process.env.SKILLET_MODEL;
  const explicitJudge = process.env.SKILLET_JUDGE_MODEL;

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
 * Source-result type used by autoDiscover to track WHY each
 * credential source returned no token. Distinguishes a clean
 * "no entry" from a transient "errored" — the latter is worth
 * retrying.
 */
type SourceResult =
  | { kind: "found"; token: string }
  | { kind: "empty" }
  | { kind: "error"; source: string; reason: string };

/**
 * Try to read the Claude Code OAuth token from macOS Keychain.
 * Claude Code stores credentials under service "Claude Code-credentials"
 * with a JSON blob containing { claudeAiOauth: { accessToken, ... } }.
 *
 * Returns a `SourceResult` so callers can distinguish "no Keychain
 * entry" (clean) from "Keychain locked / timed out / parse failed"
 * (transient — retryable).
 */
const readClaudeCodeKeychainToken = (): SourceResult => {
  if (platform() !== "darwin") {
    return { kind: "empty" };
  }

  let raw: string;
  try {
    raw = execSync('security find-generic-password -s "Claude Code-credentials" -w', {
      stdio: "pipe",
      timeout: 5_000,
    })
      .toString()
      .trim();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // The `security` binary returns exit code 44 when the entry
    // doesn't exist — that's a clean "empty", not an error.
    // Other failures (timeout, locked keychain, dyld errors) are
    // transient.
    if (msg.includes("could not be found") || msg.includes("44")) {
      return { kind: "empty" };
    }
    return {
      kind: "error",
      source: "macOS Keychain (Claude Code)",
      reason: msg.slice(0, 120),
    };
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    const token = extractClaudeOAuthToken(parsed);
    if (token == null) return { kind: "empty" };
    return { kind: "found", token };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      kind: "error",
      source: "macOS Keychain (Claude Code)",
      reason: `keychain entry present but unparseable: ${msg.slice(0, 80)}`,
    };
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
const readClaudeCodeCredentialsFile = (): SourceResult => {
  const credPath = join(homedir(), ".claude", ".credentials.json");
  if (!existsSync(credPath)) {
    return { kind: "empty" };
  }
  let raw: string;
  try {
    raw = readFileSync(credPath, "utf-8");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      kind: "error",
      source: "~/.claude/.credentials.json",
      reason: `read failed: ${msg.slice(0, 80)}`,
    };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    const token = extractClaudeOAuthToken(parsed);
    if (token == null) return { kind: "empty" };
    return { kind: "found", token };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      kind: "error",
      source: "~/.claude/.credentials.json",
      reason: `parse failed: ${msg.slice(0, 80)}`,
    };
  }
};

/**
 * Read OpenAI Codex credentials from ~/.codex/auth.json.
 * The Codex CLI stores OAuth tokens and API keys here after `codex login`.
 */
const readCodexAuthFile = (): SourceResult => {
  const authPath = join(homedir(), ".codex", "auth.json");
  if (!existsSync(authPath)) {
    return { kind: "empty" };
  }
  let raw: string;
  try {
    raw = readFileSync(authPath, "utf-8");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      kind: "error",
      source: "~/.codex/auth.json",
      reason: `read failed: ${msg.slice(0, 80)}`,
    };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return { kind: "empty" };

    for (const key of ["api_key", "token", "access_token", "apiKey"]) {
      const val = parsed[key];
      if (typeof val === "string" && val !== "") {
        return { kind: "found", token: val };
      }
    }
    return { kind: "empty" };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      kind: "error",
      source: "~/.codex/auth.json",
      reason: `parse failed: ${msg.slice(0, 80)}`,
    };
  }
};

interface DiscoveryAttempt {
  model?: AnyModel;
  transientErrors: Array<{ source: string; reason: string }>;
}

const tryAutoDiscoverOnce = (): DiscoveryAttempt => {
  const transientErrors: Array<{ source: string; reason: string }> = [];

  // Env-var-based detection. These are pure reads so they can't fail
  // transiently — empty means empty.
  for (const entry of PROVIDER_AUTODISCOVERY) {
    if (getEnvApiKey(entry.provider) != null) {
      return { model: getModelLoose(entry.provider, entry.defaultModel), transientErrors };
    }
    if (entry.extraEnvVars != null) {
      for (const envVar of entry.extraEnvVars) {
        if (envVarIsSet(envVar)) {
          return { model: getModelLoose(entry.provider, entry.defaultModel), transientErrors };
        }
      }
    }
  }

  // Credential file fallbacks. These can fail transiently — Keychain
  // can be locked, files can be temporarily unreadable, etc. Track
  // those so the caller can decide whether to retry.

  const keychain = readClaudeCodeKeychainToken();
  if (keychain.kind === "found") {
    process.env.ANTHROPIC_API_KEY = keychain.token;
    return { model: getModelLoose("anthropic", "claude-opus-4-7"), transientErrors };
  }
  if (keychain.kind === "error") {
    transientErrors.push({ source: keychain.source, reason: keychain.reason });
  }

  const credFile = readClaudeCodeCredentialsFile();
  if (credFile.kind === "found") {
    process.env.ANTHROPIC_API_KEY = credFile.token;
    return { model: getModelLoose("anthropic", "claude-opus-4-7"), transientErrors };
  }
  if (credFile.kind === "error") {
    transientErrors.push({ source: credFile.source, reason: credFile.reason });
  }

  const codex = readCodexAuthFile();
  if (codex.kind === "found") {
    process.env.OPENAI_API_KEY = codex.token;
    return { model: getModelLoose("openai", "gpt-4o"), transientErrors };
  }
  if (codex.kind === "error") {
    transientErrors.push({ source: codex.source, reason: codex.reason });
  }

  return { transientErrors };
};

const sleepSync = (ms: number): void => {
  // Synchronous sleep is acceptable here — provider discovery happens
  // once per CLI invocation, before the agent loop starts. Using
  // Atomics.wait avoids spinning the CPU.
  const buf = new SharedArrayBuffer(4);
  const view = new Int32Array(buf);
  Atomics.wait(view, 0, 0, ms);
};

const RETRY_DELAY_MS = 1_000;

const autoDiscover = (): AnyModel => {
  const first = tryAutoDiscoverOnce();
  if (first.model != null) return first.model;

  // If at least one source errored mid-check (vs cleanly returning
  // empty), retry once after a short delay. This handles the
  // common Keychain-just-locked / fresh-shell-not-yet-unlocked case
  // that previously surfaced as a misleading "no provider detected".
  if (first.transientErrors.length > 0) {
    process.stderr.write(
      `\u001B[2m  provider discovery hit transient errors, retrying in ${(RETRY_DELAY_MS / 1000).toFixed(1)}s...\u001B[0m\n`,
    );
    for (const e of first.transientErrors) {
      process.stderr.write(`\u001B[2m    ${e.source}: ${e.reason}\u001B[0m\n`);
    }
    sleepSync(RETRY_DELAY_MS);
    const second = tryAutoDiscoverOnce();
    if (second.model != null) return second.model;

    // Still no luck. The error message distinguishes "transient" from
    // "no credentials found anywhere" so the user knows whether to
    // configure something or just retry.
    if (second.transientErrors.length > 0) {
      const detail = second.transientErrors.map((e) => `  ${e.source}: ${e.reason}`).join("\n");
      throw new Error(
        `Provider discovery failed transiently. If you have credentials configured (Claude Code login, API keys, etc.), retry the command — this is often a Keychain unlock or filesystem hiccup.\n\nFailing sources after retry:\n${detail}\n\nIf the failure persists, set SKILLET_MODEL=provider/model-id to bypass auto-discovery.`,
      );
    }
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
