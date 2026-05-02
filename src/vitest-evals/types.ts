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

// ── Harness contract ─────────────────────────────────────

export type HarnessRun = {
  session: NormalizedSession;
  output?: JsonValue;
  usage: UsageSummary;
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

// ── describeEval options ─────────────────────────────────

// ── Callback-form (harness-first) describeEval ──────────────────────────

/**
 * Options for `describeEval`. Cases are defined by the `it()`
 * calls inside the body callback.
 */
export type BareDescribeEvalOptions<TInput = unknown> = {
  harness: Harness<TInput>;
  skipIf?: () => boolean;
  /** Default per-test timeout in ms (overridable on each `it`). */
  timeout?: number;
  beforeEach?: () => void | Promise<void>;
  afterEach?: () => void | Promise<void>;
};

/**
 * Harness as exposed to a callback-form `it()` body. Adds
 * `useFixture(slug)` to copy a per-case fixture tree from
 * `<skill-root>/evals/fixtures/<slug>/` into the per-test
 * workspace before the agent runs:
 *
 * ```ts
 * await harness.useFixture("my-case");
 * const result = await run("...");
 * ```
 *
 * The slug is stashed and forwarded into the next `run()` call's
 * harness context as `caseData.fixtureSlug`; the harness adapter
 * (skilletHarness) reads it at workspace creation time.
 */
export type FixtureHarness<TInput = unknown> = Harness<TInput> & {
  useFixture: (slug: string) => Promise<void>;
};

/** Per-test fixture passed to each `it()` callback. */
export type EvalTestContext<TInput = unknown> = {
  /**
   * Run the harness for this test. Resolves to a HarnessRun. Each
   * `it()` should call `run` exactly once; the fixture also writes
   * `task.meta.harness.run` so the reporter sees the trace.
   */
  run: (input: TInput, opts?: { metadata?: Record<string, JsonValue> }) => Promise<HarnessRun>;
  /**
   * Mark the test as covering the given spec entry id. Writes
   * `task.meta.tests_behavior` so the runner can map results back
   * to the spec.
   */
  behavior: (id: string) => void;
  /**
   * Harness handle augmented with `useFixture(slug)`. Use it to
   * seed a workspace before calling `run`.
   */
  harness: FixtureHarness<TInput>;
};

/**
 * The `it`-style function exposed to the body callback. Accepts a
 * test name, an optional `{ timeout }` options bag, and an async
 * function that receives the test fixture.
 */
export type EvalIt<TInput = unknown> = {
  (name: string, fn: (ctx: EvalTestContext<TInput>) => void | Promise<void>): void;
  (
    name: string,
    options: { timeout?: number },
    fn: (ctx: EvalTestContext<TInput>) => void | Promise<void>,
  ): void;
};

export type EvalSuiteBody<TInput = unknown> = (it: EvalIt<TInput>) => void;
