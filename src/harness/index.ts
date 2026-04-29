/**
 * Skillet harness adapter for vitest-evals.
 *
 * `skilletHarness({ skill: "./path" })` returns a vitest-evals `Harness`
 * that runs the agent loop against a loaded skill. Generated `.eval.ts`
 * files use it like:
 *
 *   describeEval("my-skill", {
 *     data: [...cases],
 *     harness: skilletHarness({ skill: "./my-skill" }),
 *     judges: [CriterionJudge(), SubstringJudge()],
 *   });
 *
 * Per-case workspace setup is read from `caseData.setup` if present.
 * Cases without setup get a fresh empty temp directory.
 */

import { resolveModels } from "../agent/provider.js";
import { runAgent } from "../agent/loop.js";
import { loadSkill } from "../skill/loader.js";
import { createWorkspace } from "../eval/workspace.js";
import type {
  Harness,
  HarnessCase,
  HarnessContext,
  HarnessRun,
  NormalizedMessage,
} from "../vitest-evals/index.js";

export interface SkilletHarnessOptions {
  /** Path to the skill directory (containing SKILL.md). */
  skill: string;
  /** Override timeout per case in ms. Default: 120000. */
  defaultTimeout?: number;
}

/** Per-case fields the harness reads from `caseData`. */
interface SkilletCase extends HarnessCase<string> {
  /** Optional shell setup script run in the workspace before the agent. */
  setup?: string;
  /** Per-case timeout override (ms). */
  timeout?: number;
}

const isSkilletCase = (c: HarnessCase): c is SkilletCase => {
  return typeof c.input === "string";
};

export const skilletHarness = (opts: SkilletHarnessOptions): Harness<string, SkilletCase> => {
  const skill = loadSkill(opts.skill);
  const defaultTimeout = opts.defaultTimeout ?? 120_000;

  return {
    name: "skillet",
    run: async (input: string, ctx: HarnessContext<SkilletCase>): Promise<HarnessRun> => {
      if (!isSkilletCase(ctx.caseData)) {
        throw new Error("skilletHarness: case input must be a string");
      }
      const setup = ctx.caseData.setup;
      const timeout = ctx.caseData.timeout ?? defaultTimeout;

      const workspace = createWorkspace(setup != null ? { setup } : undefined);

      try {
        const model = resolveModels().agent;
        const result = await runAgent({
          model,
          skill,
          workDir: workspace.dir,
          turns: [input],
          timeout,
        });

        const session = {
          messages: result.messages as NormalizedMessage[],
          outputText: result.output,
        };

        return {
          session,
          output: result.output,
          usage: { toolCalls: result.toolCallCount },
          errors: [],
        };
      } finally {
        workspace.cleanup();
      }
    },
  };
};
