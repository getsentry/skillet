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
 *
 * After the agent runs, the harness captures any text files the agent
 * created or modified and exposes them on `HarnessRun.artifacts`. The
 * CriterionJudge surfaces those to the LLM judge — coding skills whose
 * deliverable is a file edit are graded against the file, not just the
 * chat transcript.
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
  JsonValue,
  NormalizedMessage,
} from "../vitest-evals/index.js";
import { collectChangedArtifacts, snapshotWorkspace } from "./workspace-snapshot.js";

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
  /**
   * Optional explicit list of relative paths to capture as artifacts
   * for the judge. When omitted, the harness captures any text file
   * the agent created or modified relative to the post-setup state.
   */
  artifacts?: string[];
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
      const explicitArtifacts = ctx.caseData.artifacts;

      const workspace = createWorkspace(setup != null ? { setup } : undefined);

      try {
        // Snapshot AFTER setup so seeded fixtures aren't counted as
        // the agent's deltas. Skipped when the case explicitly names
        // its artifact paths — we already know what to capture.
        const baseline =
          explicitArtifacts == null || explicitArtifacts.length === 0
            ? snapshotWorkspace(workspace.dir)
            : new Map();

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

        const captureOpts: Parameters<typeof collectChangedArtifacts>[2] = {};
        if (explicitArtifacts != null) captureOpts.explicitPaths = explicitArtifacts;
        const captured = collectChangedArtifacts(baseline, workspace.dir, captureOpts);

        const run: HarnessRun = {
          session,
          output: result.output,
          usage: { toolCalls: result.toolCallCount },
          errors: [],
        };
        if (captured.files.size > 0) {
          const artifactsRecord: Record<string, JsonValue> = {};
          for (const [path, content] of captured.files) {
            artifactsRecord[path] = content;
          }
          run.artifacts = artifactsRecord;
        }
        return run;
      } finally {
        workspace.cleanup();
      }
    },
  };
};
