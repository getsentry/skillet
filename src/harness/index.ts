/**
 * Skillet harness adapter for vitest-evals.
 *
 * `skilletHarness({ skill: "./path" })` returns a
 * `Harness<string, { cwd?: string }>` that runs the agent loop
 * against a loaded skill. Generated `.eval.ts` files use it like:
 *
 *   describeEval(
 *     "my-skill",
 *     { harness: skilletHarness({ skill: skillRoot }), judgeThreshold: 0.75 },
 *     (raw) => {
 *       const it = withWorkspace(raw, { skillRoot });
 *       it("...", async ({ run, workspace }) => {
 *         const cwd = await workspace("my-skill__fixture");
 *         const result = await run("audit ...", { metadata: { cwd } });
 *         await expect(result).toSatisfyJudge(MyJudge);
 *       });
 *     },
 *   );
 *
 * The vitest fixture (`withWorkspace`) creates the tempdir, copies
 * the seed files in, and registers cleanup. The harness reads
 * `ctx.metadata.cwd` for that path; if absent it creates its own
 * empty tempdir (rare — only hand-edits that bypass `workspace`).
 *
 * After the agent runs, the harness captures any text files the
 * agent created or modified and exposes them on
 * `HarnessRun.artifacts` so LLM judges can grade the deliverable
 * directly (not just the chat transcript).
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Harness, HarnessContext, HarnessRun, JsonValue } from "vitest-evals";
import { resolveModels } from "../agent/provider.js";
import { runAgent } from "../agent/loop.js";
import { loadSkill } from "../skill/loader.js";
import { collectChangedArtifacts, snapshotWorkspace } from "./workspace-snapshot.js";

export interface SkilletHarnessOptions {
  /** Path to the skill directory (containing SKILL.md). */
  skill: string;
  /** Override timeout per case in ms. Default: 180000. */
  defaultTimeout?: number;
}

/**
 * Metadata the harness reads from `ctx.metadata`. Documented as a
 * type alias so callers that pass `{ cwd, artifacts, timeout }` get
 * checking, while still satisfying the upstream `HarnessMetadata`
 * constraint structurally.
 */
export type SkilletHarnessMetadata = {
  /**
   * Absolute path of the workspace directory the agent should run
   * in. Set by the `workspace(slug?)` factory installed by
   * `withWorkspace`. When absent, the harness creates an empty
   * tempdir and cleans it up itself.
   */
  cwd?: string;
  /**
   * Optional explicit list of relative paths to capture as artifacts
   * for the judge. When omitted, the harness captures any text file
   * the agent created or modified relative to the post-fixture state.
   */
  artifacts?: string[];
  /** Per-case timeout override (ms). */
  timeout?: number;
};

/**
 * Env var that overrides which skill the harness loads. Set by
 * `skillet eval <a> --against <b>` so case data from skill A runs
 * against skill B's SKILL.md as the system prompt — a fair
 * head-to-head where the only variable is the skill body.
 */
export const COMPARE_SKILL_ENV = "SKILLET_COMPARE_SKILL";

export const skilletHarness = (opts: SkilletHarnessOptions): Harness<string> => {
  const override = process.env[COMPARE_SKILL_ENV];
  const skillPath = override != null && override !== "" ? override : opts.skill;
  const skill = loadSkill(skillPath);
  const defaultTimeout = opts.defaultTimeout ?? 180_000;

  return {
    name: "skillet",
    run: async (input: string, ctx: HarnessContext): Promise<HarnessRun> => {
      const meta = ctx.metadata as SkilletHarnessMetadata;
      const timeout = meta.timeout ?? defaultTimeout;
      const explicitArtifacts = meta.artifacts;

      // Use the workspace cwd from `withWorkspace` when present;
      // otherwise create a throwaway tempdir for this run.
      let workspaceDir: string;
      let ownedTempdir: string | null = null;
      if (meta.cwd != null && meta.cwd !== "") {
        workspaceDir = meta.cwd;
      } else {
        ownedTempdir = mkdtempSync(join(tmpdir(), "skillet-eval-"));
        workspaceDir = ownedTempdir;
      }

      try {
        // Snapshot before the agent runs so seeded fixture files
        // aren't counted as the agent's deltas. Skip when the case
        // explicitly names artifact paths.
        const baseline =
          explicitArtifacts == null || explicitArtifacts.length === 0
            ? snapshotWorkspace(workspaceDir)
            : new Map();

        const model = resolveModels().agent;
        const result = await runAgent({
          model,
          skill,
          workDir: workspaceDir,
          turns: [input],
          timeout,
        });

        const session = {
          messages: result.messages,
          outputText: result.output,
        };

        const captureOpts: Parameters<typeof collectChangedArtifacts>[2] = {};
        if (explicitArtifacts != null) captureOpts.explicitPaths = explicitArtifacts;
        const captured = collectChangedArtifacts(baseline, workspaceDir, captureOpts);

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
        if (ownedTempdir != null) {
          rmSync(ownedTempdir, { recursive: true, force: true });
        }
      }
    },
  };
};
