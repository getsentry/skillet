/**
 * Judges for the harness-first eval API.
 *
 * Named judges are declared via `judge("Name", async (ctx) => ...)`
 * and consumed via `await expect(result).toSatisfyJudge(NameJudge)`
 * inside an `it()` body. The judge body receives a `criterion(text)`
 * helper that calls skillet's LLM judge — so most named judges
 * look like `return ctx.criterion("the response …")`.
 */

import { resolveModels } from "../agent/provider.js";
import { judge as runJudgeLLM, type JudgeArtifact } from "../eval/judge.js";
import type { HarnessRun, NormalizedMessage } from "./types.js";

// ── Internal: judge identity tag ───────────────────────────────────────────

/**
 * Symbol attached to functions returned by `judge()` so the
 * `toSatisfyJudge` matcher can distinguish them from arbitrary
 * functions and emit a useful error if someone passes a stray fn.
 */
export const JUDGE_TAG = Symbol("@sentry/skillet/evals.judge");

// ── Side-channel: HarnessRun → vitest task meta ────────────────────────────

/**
 * Maps each `HarnessRun` produced inside the callback-form `it()`
 * fixture to its vitest `task.meta` bag so the `toSatisfyJudge`
 * matcher can push named-judge results onto `meta.judges`. Populated
 * by `describe-eval.ts` after each `harness.run(...)` resolves.
 *
 * WeakMap so meta references don't leak past test lifecycle.
 */
const HARNESS_RUN_META: WeakMap<object, Record<string, unknown>> = new WeakMap();

export const setJudgeRunMeta = (run: HarnessRun, meta: Record<string, unknown>): void => {
  HARNESS_RUN_META.set(run, meta);
};

const getJudgeRunMeta = (run: HarnessRun): Record<string, unknown> | undefined => {
  return HARNESS_RUN_META.get(run);
};

// ── Named judge factory ────────────────────────────────────────────────────

export type JudgeBodyResult = {
  score: number;
  metadata?: { rationale?: string; grade?: string; [key: string]: unknown };
};

export type JudgeContext = {
  /** The agent's textual output, projected from `run.output`/`session`. */
  output: string;
  /** The full HarnessRun, including session and artifacts. */
  run: HarnessRun;
  /**
   * Convenience helper that calls skillet's LLM judge with the
   * given criterion text and returns
   * `{ score, metadata: { rationale, grade } }`. Routes through
   * `src/eval/judge.ts:judge()`.
   */
  criterion: (text: string) => Promise<JudgeBodyResult>;
};

export type NamedJudgeFn = ((ctx: JudgeContext) => Promise<JudgeBodyResult> | JudgeBodyResult) & {
  readonly [JUDGE_TAG]: true;
  /** Stable display name used in reporter output. */
  readonly name: string;
};

const isNamedJudge = (fn: unknown): fn is NamedJudgeFn => {
  if (typeof fn !== "function") return false;
  // oxlint-disable-next-line no-unsafe-type-assertion
  return (fn as unknown as Record<symbol, unknown>)[JUDGE_TAG] === true;
};

/**
 * Declare a named judge. The returned function is callable directly
 * (for unit tests) and recognized by `toSatisfyJudge`.
 *
 * ```ts
 * const PwnRequestJudge = judge("PwnRequestJudge", async ({ criterion }) => {
 *   return criterion("The response identifies …");
 * });
 *
 * it("…", async ({ run }) => {
 *   const result = await run("…");
 *   await expect(result).toSatisfyJudge(PwnRequestJudge);
 * });
 * ```
 */
export const judge = (
  name: string,
  fn: (ctx: JudgeContext) => Promise<JudgeBodyResult> | JudgeBodyResult,
): NamedJudgeFn => {
  const tagged = async (ctx: JudgeContext): Promise<JudgeBodyResult> => {
    return fn(ctx);
  };
  Object.defineProperty(tagged, "name", { value: name, configurable: true });
  Object.defineProperty(tagged, JUDGE_TAG, { value: true, enumerable: false });
  // The runtime properties above (`name`, JUDGE_TAG) line `tagged`
  // up with the NamedJudgeFn brand; the cast goes through `unknown`
  // so the lint sees the deliberate transition.
  // oxlint-disable-next-line no-unsafe-type-assertion
  return tagged as unknown as NamedJudgeFn;
};

// ── toSatisfyJudge matcher ─────────────────────────────────────────────────

/**
 * Default pass threshold. Judges scoring at or above this pass; below
 * fails the matcher with the rationale surfaced in the error message.
 * Override per-call via `toSatisfyJudge(judge, { threshold: 0.5 })`.
 */
const DEFAULT_THRESHOLD = 0.75;

export type ToSatisfyJudgeOptions = {
  threshold?: number;
};

interface MatcherResult {
  pass: boolean;
  message: () => string;
}

const buildJudgeContext = (run: HarnessRun): JudgeContext => {
  const output = formatOutput(run);
  return {
    output,
    run,
    criterion: async (text: string) => {
      const model = resolveModels().judge;
      const artifacts = collectArtifactsForJudge(run);
      const transcript = formatTranscriptForJudge(run, output);
      const result = await runJudgeLLM(model, transcript, text, artifacts);
      return {
        score: result.score,
        metadata: { rationale: result.reasoning, grade: result.grade },
      };
    },
  };
};

const recordJudgeOnMeta = (run: HarnessRun, judgeName: string, body: JudgeBodyResult): void => {
  const meta = getJudgeRunMeta(run);
  if (meta == null) return;
  const existing = Array.isArray(meta.judges) ? (meta.judges as unknown[]) : [];
  existing.push({
    name: judgeName,
    score: body.score,
    rationale: body.metadata?.rationale,
    grade: body.metadata?.grade,
  });
  meta.judges = existing;
};

/**
 * Implementation of the `toSatisfyJudge` matcher. Exposed for
 * registration via `expect.extend` from `index.ts`.
 *
 * Accepts a HarnessRun (or anything matching its session/output shape)
 * and a named judge declared via `judge(name, fn)`.
 */
export const toSatisfyJudgeImpl = async (
  received: unknown,
  judgeFn: unknown,
  options?: ToSatisfyJudgeOptions,
): Promise<MatcherResult> => {
  if (!isNamedJudge(judgeFn)) {
    return {
      pass: false,
      message: () =>
        'toSatisfyJudge: argument is not a named judge. Wrap your judge body with `judge("Name", fn)` from @sentry/skillet/evals.',
    };
  }
  if (!isHarnessRunLike(received)) {
    return {
      pass: false,
      message: () =>
        "toSatisfyJudge: received value is not a HarnessRun. Pass the result of `await run(input)`.",
    };
  }

  const threshold = options?.threshold ?? DEFAULT_THRESHOLD;
  const ctx = buildJudgeContext(received);
  const body = await judgeFn(ctx);
  recordJudgeOnMeta(received, judgeFn.name, body);

  const pass = body.score >= threshold;
  const rationale = body.metadata?.rationale ?? "(no rationale)";
  return {
    pass,
    message: () =>
      pass
        ? `expected ${judgeFn.name} not to pass (score ${body.score.toFixed(2)} >= ${threshold.toFixed(2)})\n  ${rationale}`
        : `expected ${judgeFn.name} to pass (score ${body.score.toFixed(2)} < ${threshold.toFixed(2)})\n  ${rationale}`,
  };
};

const isHarnessRunLike = (v: unknown): v is HarnessRun => {
  if (v == null || typeof v !== "object") return false;
  const session = (v as { session?: unknown }).session;
  return session != null && typeof session === "object";
};

/**
 * Register `toSatisfyJudge` on vitest's expect. Idempotent; safe to
 * call multiple times. Invoked once at module load from `index.ts`.
 */
export const registerJudgeMatchers = (): void => {
  // Imported lazily so non-test consumers of this module don't
  // require vitest as a runtime dependency.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  void import("vitest").then(({ expect }) => {
    expect.extend({
      // oxlint-disable-next-line consistent-function-scoping
      async toSatisfyJudge(received: unknown, judgeFn: unknown, options?: ToSatisfyJudgeOptions) {
        return toSatisfyJudgeImpl(received, judgeFn, options);
      },
    });
  });
};

// ── Output / transcript / artifact formatters ──────────────────────────────

const formatOutput = (run: HarnessRun): string => {
  if (typeof run.output === "string") return run.output;
  if (run.output !== undefined) {
    try {
      return JSON.stringify(run.output);
    } catch {
      return Object.prototype.toString.call(run.output);
    }
  }
  return run.session.outputText ?? "";
};

const collectArtifactsForJudge = (run: HarnessRun | undefined): JudgeArtifact[] => {
  const raw = run?.artifacts;
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return [];
  const out: JudgeArtifact[] = [];
  for (const [path, content] of Object.entries(raw)) {
    if (typeof content === "string" && content.length > 0) {
      out.push({ command: `cat ${path}`, stdout: content });
    }
  }
  return out;
};

const stringifyForTranscript = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return Object.prototype.toString.call(value);
  }
};

const formatToolCalls = (message: NormalizedMessage): string => {
  const calls = message.toolCalls ?? [];
  if (calls.length === 0) return "";
  const blocks = calls.map((call) => {
    const details: string[] = [`name=${call.name}`];
    if (call.arguments != null) details.push(`args=${JSON.stringify(call.arguments)}`);
    if (call.result != null) details.push(`result=${stringifyForTranscript(call.result)}`);
    if (call.error != null) details.push(`error=${call.error.message}`);
    return `  - ${details.join(" ")}`;
  });
  return `\nTool calls:\n${blocks.join("\n")}`;
};

const formatTranscriptForJudge = (run: HarnessRun | undefined, fallbackOutput: string): string => {
  const messages = run?.session.messages ?? [];
  if (messages.length === 0) return fallbackOutput;
  return messages
    .map((message, i) => {
      const content = stringifyForTranscript(message.content);
      const tools = formatToolCalls(message);
      return `### ${i + 1}. ${message.role}\n\n${content}${tools}`;
    })
    .join("\n\n");
};
