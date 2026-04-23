/**
 * Normalized eval result types, shaped toward vitest-evals compatibility.
 *
 * These mirror the vitest-evals NormalizedSession / HarnessRun / UsageSummary
 * shapes so that future migration is a type alignment, not a data restructure.
 */

// ── Primitives ────────────────────────────────────────────

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

// ── Session / Messages ────────────────────────────────────

export interface NormalizedMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: JsonValue;
  metadata?: Record<string, JsonValue>;
}

export interface NormalizedSession {
  messages: NormalizedMessage[];
  outputText?: string;
  provider?: string;
  model?: string;
}

// ── Usage ─────────────────────────────────────────────────

export interface UsageSummary {
  provider?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  toolCalls?: number;
}

// ── Check / Judge ─────────────────────────────────────────

export interface CheckResultNormalized {
  name: string;
  passed: boolean;
  detail: string;
}

export interface JudgeResultNormalized {
  grade: string;
  score: number;
  reasoning: string;
}

// ── Error ─────────────────────────────────────────────────

export interface ErrorRecord {
  type: string;
  message: string;
}

// ── Per-case result ───────────────────────────────────────

export type CaseStatus = "pass" | "fail" | "skip" | "error";

export interface EvalCaseResult {
  name: string;
  file: string;
  status: CaseStatus;
  duration: number;
  session: NormalizedSession;
  usage: UsageSummary;
  checks: CheckResultNormalized[];
  judge?: JudgeResultNormalized;
  errors: ErrorRecord[];
  /** Why it was skipped (only when status is "skip") */
  skipReason?: string;
}

// ── Run-level result ──────────────────────────────────────

export interface EvalRunResult {
  cases: EvalCaseResult[];
  summary: {
    total: number;
    pass: number;
    fail: number;
    skip: number;
    error: number;
    durationMs: number;
  };
}
