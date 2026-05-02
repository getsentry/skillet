import {
  afterEach as vitestAfterEach,
  beforeEach as vitestBeforeEach,
  describe,
  test,
} from "vitest";
import { setJudgeRunMeta } from "./judges.js";
import type {
  BareDescribeEvalOptions,
  EvalIt,
  EvalSuiteBody,
  EvalTestContext,
  FixtureHarness,
  HarnessCase,
  HarnessContext,
  JsonValue,
  NormalizedSession,
  ToolCallRecord,
} from "./types.js";

const isRecord = (v: unknown): v is Record<string, unknown> => {
  return v != null && typeof v === "object" && !Array.isArray(v);
};

/**
 * Harness-first `describeEval(name, opts, body)`. The `body`
 * callback registers individual `it("name", async ({ run }) => ...)`
 * blocks against the supplied `harness`. Each block calls `run(input)`
 * once and asserts on the returned HarnessRun via vitest `expect(...)`
 * and the `toSatisfyJudge` matcher.
 *
 * On settle, each test populates `task.meta.harness.run` (full run),
 * `task.meta.judges` (named-judge results from `toSatisfyJudge`),
 * and `task.meta.tests_behavior` (set via the `behavior(id)` helper).
 * The vitest-runner reporter consumes these channels.
 */
export const describeEval = <TInput = unknown>(
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
        // Pending fixture slug stashed by `harness.useFixture(...)`
        // and forwarded into the harness's run context as
        // `caseData.fixtureSlug`. skilletHarness reads it at
        // workspace creation time.
        let pendingFixture: string | undefined;

        // Wrap the user-supplied harness so the fixture can expose
        // `useFixture(slug)` without changing the base contract.
        const fixtureHarness: FixtureHarness<TInput> = {
          name: options.harness.name,
          run: options.harness.run,
          useFixture: async (slug: string): Promise<void> => {
            pendingFixture = slug;
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
              ...(pendingFixture != null ? { fixtureSlug: pendingFixture } : {}),
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
        // Without this the reporter shows a green pass with no
        // harness trace, which is confusing.
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

/**
 * Flatten all tool calls from a normalized session's messages.
 * Re-exported because eval `test` callbacks commonly assert on
 * tool usage.
 */
export const toolCalls = (session: NormalizedSession): ToolCallRecord[] => {
  return session.messages.flatMap((m) => m.toolCalls ?? []);
};
