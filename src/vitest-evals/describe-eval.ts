import {
  afterEach as vitestAfterEach,
  assert,
  beforeEach as vitestBeforeEach,
  describe,
  test,
} from "vitest";
import type {
  DescribeEvalOptions,
  HarnessCase,
  HarnessContext,
  HarnessRun,
  JsonValue,
  JudgeResult,
  NormalizedSession,
  ToolCallRecord,
} from "./types.js";

/**
 * Mirror of vitest-evals' harness-first `describeEval`. Generates one
 * vitest test per case in the `data` array, calling the harness for
 * each, then running judges and the test callback.
 *
 * On failure, the per-case `task.meta.eval` and `task.meta.harness`
 * fields are populated so a reporter can surface the run details.
 *
 * This implementation tracks the upstream API (#41) closely enough
 * that swapping the import to the published package is a one-liner.
 */
export const describeEval = <TCase extends HarnessCase>(
  name: string,
  options: DescribeEvalOptions<TCase>,
): void => {
  describe(name, async () => {
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

      testFn(
        displayName,
        { timeout: options.timeout ?? 60_000 },
        async ({ task: testTask }) => {
          const artifacts: Record<string, JsonValue> = {};
          const context: HarnessContext<TCase> = {
            caseData,
            task: testTask as unknown as { meta: Record<string, unknown> },
            artifacts,
            setArtifact: (artifactName, value) => {
              artifacts[artifactName] = value;
            },
          };

          const run = await options.harness.run(input, context);

          if (Object.keys(artifacts).length > 0 && run.artifacts == null) {
            run.artifacts = artifacts;
          }

          (testTask.meta as Record<string, unknown>).harness = {
            name: options.harness.name,
            run,
          };
          // Skillet uses `tests_behavior` to map case results back to
          // spec entries. Surface it on task.meta so the runner can
          // read it from vitest's JSON reporter output.
          if (typeof caseData.tests_behavior === "string") {
            (testTask.meta as Record<string, unknown>).tests_behavior = caseData.tests_behavior;
          }

          // ── Judges ────────────────────────────────────
          const judges = options.judges ?? [];
          if (judges.length > 0) {
            const output = formatOutput(run);
            const tools = toolCalls(run.session);
            const scores: Array<JudgeResult & { name: string }> = [];

            for (const judge of judges) {
              const result = await judge({
                ...(caseData as Record<string, unknown>),
                input: typeof input === "string" ? input : JSON.stringify(input),
                rawInput: input,
                output,
                assistantOutput: run.session.outputText ?? output,
                toolCalls: tools,
                caseData,
                run,
                session: run.session,
              });
              scores.push({ ...result, name: judge.name || "AnonymousJudge" });
            }

            const avgScore =
              scores.reduce((acc, s) => acc + (s.score ?? 0), 0) / scores.length;
            const threshold = options.threshold === undefined ? 1.0 : options.threshold;
            const thresholdFailed = threshold !== null && avgScore < threshold;

            (testTask.meta as Record<string, unknown>).eval = {
              scores,
              avgScore,
              output,
              toolCalls: tools,
              thresholdFailed,
            };

            if (thresholdFailed) {
              const lines = [
                `Score: ${avgScore.toFixed(2)} below threshold: ${threshold!.toFixed(2)}`,
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
        },
      );
    }
  });
};

const resolveCaseData = async <TCase extends HarnessCase>(
  data: DescribeEvalOptions<TCase>["data"],
): Promise<TCase[]> => {
  return typeof data === "function" ? await data() : data;
};

const formatTestName = (input: unknown): string => {
  if (typeof input === "string") return input;
  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
};

const formatOutput = (run: HarnessRun): string => {
  if (typeof run.output === "string") return run.output;
  if (run.output !== undefined) {
    try {
      return JSON.stringify(run.output);
    } catch {
      return String(run.output);
    }
  }
  return run.session.outputText ?? "";
};

/**
 * Flatten all tool calls from a normalized session's messages.
 * Re-exported because eval `test` callbacks commonly assert on tool usage.
 */
export const toolCalls = (session: NormalizedSession): ToolCallRecord[] => {
  return session.messages.flatMap((m) => m.toolCalls ?? []);
};
