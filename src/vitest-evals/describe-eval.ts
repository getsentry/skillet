import {
  afterEach as vitestAfterEach,
  assert,
  beforeEach as vitestBeforeEach,
  describe,
  test,
} from "vitest";
import { setJudgeRunMeta } from "./judges.js";
import type {
  BareDescribeEvalOptions,
  DescribeEvalOptions,
  EvalIt,
  EvalSuiteBody,
  EvalTestContext,
  FixtureHarness,
  HarnessCase,
  HarnessContext,
  HarnessRun,
  JsonValue,
  JudgeResult,
  NormalizedSession,
  ToolCallRecord,
} from "./types.js";

const isRecord = (v: unknown): v is Record<string, unknown> => {
  return v != null && typeof v === "object" && !Array.isArray(v);
};

/**
 * Detect the callback-form invocation. The harness-first form takes
 * three arguments and the second argument carries no `data` field.
 */
const isCallbackForm = <TCase extends HarnessCase>(
  options: DescribeEvalOptions<TCase> | BareDescribeEvalOptions,
  body: EvalSuiteBody | undefined,
): options is BareDescribeEvalOptions => {
  return typeof body === "function" && !("data" in options);
};

/**
 * Mirror of vitest-evals' harness-first `describeEval`. Two forms:
 *
 * 1. **Data-array form (compat)** — `describeEval(name, { data, harness, judges, ... })`.
 *    One test per entry in `data`; harness/judges/threshold come from options.
 *    Preserved for files generated before the harness-first migration.
 *
 * 2. **Callback form (current)** — `describeEval(name, { harness, ... }, (it) => { ... })`.
 *    The body callback registers individual `it("name", async ({ run }) => ...)`
 *    blocks. Each block calls `run(input)` and asserts on the returned
 *    HarnessRun via vitest `expect(...)` and the `toSatisfyJudge` matcher.
 *
 * On failure, the per-case `task.meta.harness` field is populated so a
 * reporter can surface the run details. The callback form also writes
 * `task.meta.judges` (filled by the `toSatisfyJudge` matcher) and
 * `task.meta.tests_behavior` (set via the `behavior(id)` helper).
 */
export function describeEval<TCase extends HarnessCase>(
  name: string,
  options: DescribeEvalOptions<TCase>,
): void;
export function describeEval<TInput = unknown>(
  name: string,
  options: BareDescribeEvalOptions<TInput>,
  body: EvalSuiteBody<TInput>,
): void;
export function describeEval<TCase extends HarnessCase>(
  name: string,
  options: DescribeEvalOptions<TCase> | BareDescribeEvalOptions,
  body?: EvalSuiteBody,
): void {
  if (body !== undefined && isCallbackForm<TCase>(options, body)) {
    runCallbackForm(name, options, body);
    return;
  }
  // The non-callback overload narrows to `DescribeEvalOptions<TCase>`
  // by elimination — `body` is undefined and `data` is present. The
  // cast through `unknown` keeps the lint quiet without weakening the
  // behavior.
  // oxlint-disable-next-line no-unsafe-type-assertion
  runDataArrayForm(name, options as unknown as DescribeEvalOptions<TCase>);
}

const runDataArrayForm = <TCase extends HarnessCase>(
  name: string,
  options: DescribeEvalOptions<TCase>,
): void => {
  // `describe.concurrent` makes every `test()` inside run in parallel,
  // up to vitest's `maxConcurrency` (default 5; we bump it to ≥4 in
  // the runner's generated config). Without this, vitest serializes
  // tests within a file — fine for unit tests but ruinous for
  // LLM-backed eval cases that each take seconds.
  describe.concurrent(name, async () => {
    if (options.beforeEach != null) {
      vitestBeforeEach(options.beforeEach);
    }
    if (options.afterEach != null) {
      vitestAfterEach(options.afterEach);
    }

    const testFn = options.skipIf != null ? test.skipIf(options.skipIf()) : test;
    const cases = await resolveCaseData(options.data);

    for (const caseData of cases) {
      const { input, name: testName } = caseData;
      const displayName = testName ?? formatTestName(input);
      const agentTimeout = caseTimeout(caseData, options.timeout ?? 60_000);
      const testTimeout = agentTimeout + 60_000;

      testFn(displayName, { timeout: testTimeout }, async ({ task: testTask }) => {
        const artifacts: Record<string, JsonValue> = {};
        // testTask is vitest's RunnerTask; we treat its `meta` as a
        // plain string-keyed bag for skillet's purposes. The runtime
        // shape is always object — vitest constructs it as `{}`.
        // oxlint-disable-next-line no-unsafe-type-assertion
        const meta = testTask.meta as Record<string, unknown>;
        const context: HarnessContext<TCase> = {
          caseData,
          task: { meta },
          artifacts,
          setArtifact: (artifactName, value) => {
            artifacts[artifactName] = value;
          },
        };

        const run = await options.harness.run(input, context);

        if (Object.keys(artifacts).length > 0 && run.artifacts == null) {
          run.artifacts = artifacts;
        }

        meta.harness = {
          name: options.harness.name,
          run,
        };
        // Skillet uses `tests_behavior` to map case results back to
        // spec entries. Surface it on task.meta so the runner can
        // read it from vitest's JSON reporter output.
        if (typeof caseData.tests_behavior === "string") {
          meta.tests_behavior = caseData.tests_behavior;
        }

        // ── Judges ────────────────────────────────────
        const judges = options.judges ?? [];
        if (judges.length > 0) {
          const output = formatOutput(run);
          const tools = toolCalls(run.session);
          const scores: Array<JudgeResult & { name: string }> = [];

          for (const judge of judges) {
            const result = await judge({
              ...caseData,
              input: typeof input === "string" ? input : JSON.stringify(input),
              rawInput: input,
              output,
              assistantOutput: run.session.outputText ?? output,
              toolCalls: tools,
              caseData,
              run,
              session: run.session,
            });
            scores.push({ ...result, name: judge.name === "" ? "AnonymousJudge" : judge.name });
          }

          const avgScore = scores.reduce((acc, s) => acc + (s.score ?? 0), 0) / scores.length;
          const threshold = options.threshold === undefined ? 1 : options.threshold;
          const thresholdFailed = threshold !== null && avgScore < threshold;

          meta.eval = {
            scores,
            avgScore,
            output,
            toolCalls: tools,
            thresholdFailed,
          };

          if (thresholdFailed) {
            const t = threshold ?? 1;
            const lines = [
              `Score: ${avgScore.toFixed(2)} below threshold: ${t.toFixed(2)}`,
              ...scores.map(
                (s) =>
                  `  ${s.name}: ${s.score?.toFixed(2) ?? "null"}${
                    s.metadata?.rationale != null ? ` — ${s.metadata.rationale}` : ""
                  }`,
              ),
            ];
            assert(false, lines.join("\n"));
          }
        }

        // ── Optional test callback ────────────────────
        if (options.test != null) {
          await options.test({
            input,
            caseData,
            run,
            session: run.session,
          });
        }
      });
    }
  });
};

/**
 * Callback-form runner: `describeEval(name, { harness, ... }, (it) => { ... })`.
 *
 * Each `it()` invocation inside the body registers one vitest test
 * with a fixture exposing `run`, `behavior`, and `harness`. The body
 * is run once at suite-construction time to enumerate tests.
 */
const runCallbackForm = <TInput>(
  name: string,
  options: BareDescribeEvalOptions<TInput>,
  body: EvalSuiteBody<TInput>,
): void => {
  describe.concurrent(name, () => {
    if (options.beforeEach != null) {
      vitestBeforeEach(options.beforeEach);
    }
    if (options.afterEach != null) {
      vitestAfterEach(options.afterEach);
    }

    const baseTestFn = options.skipIf != null ? test.skipIf(options.skipIf()) : test;
    const defaultTimeout = options.timeout ?? 60_000;

    type ItBody = (ctx: EvalTestContext<TInput>) => void | Promise<void>;

    const it: EvalIt<TInput> = (
      testName: string,
      arg2: { timeout?: number } | ItBody,
      arg3?: ItBody,
    ): void => {
      // When `arg2` is the options bag, the body is `arg3`. Otherwise
      // `arg2` itself is the body. The discriminator is whether
      // `arg2` is a plain object — an `ItBody` is a function, never a
      // record.
      let itOpts: { timeout?: number } | undefined;
      let fn: ItBody;
      if (isRecord(arg2)) {
        itOpts = arg2;
        // oxlint-disable-next-line no-unsafe-type-assertion
        fn = arg3 as ItBody;
      } else {
        fn = arg2;
      }

      const agentTimeout = itOpts?.timeout ?? defaultTimeout;
      // Add a 60s buffer for assertion + judge work after the agent settles.
      const testTimeout = agentTimeout + 60_000;

      baseTestFn(testName, { timeout: testTimeout }, async ({ task: testTask }) => {
        const artifacts: Record<string, JsonValue> = {};
        // testTask is vitest's RunnerTask; we treat its `meta` as a
        // plain string-keyed bag for skillet's purposes. The runtime
        // shape is always object — vitest constructs it as `{}`.
        // oxlint-disable-next-line no-unsafe-type-assertion
        const meta = testTask.meta as Record<string, unknown>;

        let invokedRun = false;
        // Pending setup script stashed by `harness.setup(...)` and
        // forwarded into the harness's run context as `caseData.setup`.
        // skilletHarness reads it at workspace creation time.
        let pendingSetup: string | undefined;

        // Wrap the user-supplied harness so the fixture can expose
        // a `setup(script)` method without changing the base
        // harness contract. The wrapped harness defers setup until
        // the next `run()` call.
        const fixtureHarness: FixtureHarness<TInput> = {
          name: options.harness.name,
          run: options.harness.run,
          setup: async (script: string): Promise<void> => {
            pendingSetup = script;
          },
        };

        const ctx: EvalTestContext<TInput> = {
          harness: fixtureHarness,
          behavior: (id: string) => {
            meta.tests_behavior = id;
          },
          run: async (input, runOpts) => {
            invokedRun = true;
            const caseData: HarnessCase<TInput> = {
              input,
              name: testName,
              ...(pendingSetup != null ? { setup: pendingSetup } : {}),
              ...runOpts?.metadata,
            };
            const harnessCtx: HarnessContext<HarnessCase<TInput>> = {
              caseData,
              task: { meta },
              artifacts,
              setArtifact: (artifactName, value) => {
                artifacts[artifactName] = value;
              },
            };
            const run = await options.harness.run(input, harnessCtx);
            if (Object.keys(artifacts).length > 0 && run.artifacts == null) {
              run.artifacts = artifacts;
            }
            meta.harness = {
              name: options.harness.name,
              run,
            };
            // Side-channel for the toSatisfyJudge matcher to push
            // named-judge results onto this test's task.meta.judges.
            setJudgeRunMeta(run, meta);
            return run;
          },
        };

        await fn(ctx);

        // Surface a clear error if the test forgot to invoke `run`.
        // Without this the reporter shows a green pass with no harness
        // trace, which is confusing.
        if (!invokedRun) {
          throw new Error(
            `eval test "${testName}" did not call run(input). Each it() body must invoke run() exactly once.`,
          );
        }
      });
    };

    body(it);
  });
};

const caseTimeout = (caseData: HarnessCase, fallback: number): number => {
  const raw = caseData.timeout;
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : fallback;
};

const resolveCaseData = async <TCase extends HarnessCase>(
  data: DescribeEvalOptions<TCase>["data"],
): Promise<TCase[]> => {
  if (typeof data === "function") return data();
  return data;
};

const formatTestName = (input: unknown): string => {
  if (typeof input === "string") return input;
  try {
    return JSON.stringify(input);
  } catch {
    return safeStringify(input);
  }
};

const formatOutput = (run: HarnessRun): string => {
  if (typeof run.output === "string") return run.output;
  if (run.output !== undefined) {
    try {
      return JSON.stringify(run.output);
    } catch {
      return safeStringify(run.output);
    }
  }
  return run.session.outputText ?? "";
};

const safeStringify = (v: unknown): string => {
  if (v == null) return String(v);
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return Object.prototype.toString.call(v);
  }
};

/**
 * Flatten all tool calls from a normalized session's messages.
 * Re-exported because eval `test` callbacks commonly assert on tool usage.
 */
export const toolCalls = (session: NormalizedSession): ToolCallRecord[] => {
  return session.messages.flatMap((m) => m.toolCalls ?? []);
};
