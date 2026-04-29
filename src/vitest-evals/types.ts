/**
 * Types mirroring the harness-first vitest-evals API
 * (getsentry/vitest-evals#41).
 *
 * This is a local mini-lib; generated `.eval.ts` files import from
 * `@sentry/skillet/evals`, which re-exports these types and the
 * describeEval implementation. When vitest-evals 0.9 (with the
 * harness-first API) ships, this module is deleted and the re-exports
 * point at the real package — generated eval files don't change.
 *
 * Only the surface skillet uses is mirrored; ToolCallJudge,
 * StructuredOutputJudge, and replay support are out of scope.
 */

// ── JSON primitives ──────────────────────────────────────

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

// ── Session / messages ───────────────────────────────────

export type ToolCallRecord = {
  id?: string;
  name: string;
  arguments?: Record<string, JsonValue>;
  result?: JsonValue;
  error?: { message: string; type?: string };
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
};

export type NormalizedMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: JsonValue;
  toolCalls?: ToolCallRecord[];
  metadata?: Record<string, JsonValue>;
};

export type NormalizedSession = {
  messages: NormalizedMessage[];
  outputText?: string;
  provider?: string;
  model?: string;
  metadata?: Record<string, JsonValue>;
};

// ── Usage / timings ──────────────────────────────────────

export type UsageSummary = {
  provider?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
  estimatedCost?: number;
  toolCalls?: number;
  retries?: number;
};

export type TimingSummary = {
  totalMs?: number;
};

// ── Harness contract ─────────────────────────────────────

export type HarnessRun = {
  session: NormalizedSession;
  output?: JsonValue;
  usage: UsageSummary;
  timings?: TimingSummary;
  artifacts?: Record<string, JsonValue>;
  errors: Array<Record<string, JsonValue>>;
};

export type HarnessCase<TInput = unknown> = {
  input: TInput;
  name?: string;
} & Record<string, unknown>;

export type HarnessContext<TCase extends HarnessCase = HarnessCase> = {
  caseData: TCase;
  /** vitest task — exposed for advanced use; most tests don't need it. */
  task: { meta: Record<string, unknown> };
  signal?: AbortSignal;
  artifacts: Record<string, JsonValue>;
  setArtifact: (name: string, value: JsonValue) => void;
};

export type Harness<TInput = unknown, TCase extends HarnessCase<TInput> = HarnessCase<TInput>> = {
  name: string;
  run: (input: TInput, context: HarnessContext<TCase>) => Promise<HarnessRun>;
};

// ── Judges ───────────────────────────────────────────────

export type JudgeResult = {
  score: number | null;
  metadata?: {
    rationale?: string;
    [key: string]: unknown;
  };
};

export type BaseJudgeOptions = {
  input: string;
  output: string;
  rawInput?: unknown;
  caseData?: HarnessCase;
  run?: HarnessRun;
  session?: NormalizedSession;
  toolCalls?: ToolCallRecord[];
  [key: string]: unknown;
};

export type JudgeFn<TOptions extends BaseJudgeOptions = BaseJudgeOptions> = ((
  options: TOptions,
) => JudgeResult | Promise<JudgeResult>) & {
  /** Used for reporter output. Set via `Object.defineProperty` on the function. */
  name: string;
};

// ── describeEval options ─────────────────────────────────

export type HarnessCaseSource<TCase extends HarnessCase = HarnessCase> =
  | TCase[]
  | (() => TCase[] | Promise<TCase[]>);

export type HarnessEvalContext<TCase extends HarnessCase = HarnessCase> = {
  input: TCase["input"];
  caseData: TCase;
  run: HarnessRun;
  session: NormalizedSession;
};

export type DescribeEvalOptions<TCase extends HarnessCase = HarnessCase> = {
  data: HarnessCaseSource<TCase>;
  harness: Harness<TCase["input"], TCase>;
  judges?: Array<JudgeFn>;
  /** Threshold for average judge score. Default 1.0; null disables. */
  threshold?: number | null;
  /** Test callback; runs after the harness + judges complete. */
  test?: (ctx: HarnessEvalContext<TCase>) => void | Promise<void>;
  skipIf?: () => boolean;
  /** Per-test timeout in ms. Default 60000. */
  timeout?: number;
  beforeEach?: () => void | Promise<void>;
  afterEach?: () => void | Promise<void>;
};
