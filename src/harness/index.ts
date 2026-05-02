/**
 * Skillet harness adapter for vitest-evals.
 *
 * `skilletHarness({ skill: "./path" })` returns a `Harness` that
 * runs the agent loop against a loaded skill. Generated
 * `.eval.ts` files use it like:
 *
 *   describeEval(
 *     "my-skill",
 *     { harness: skilletHarness({ skill: skillRoot }) },
 *     (it) => {
 *       it("...", async ({ run, behavior, harness }) => {
 *         behavior("my-skill");
 *         await harness.useFixture("my-skill__fixture");
 *         const result = await run("audit ...");
 *         await expect(result).toSatisfyJudge(MyJudge);
 *       });
 *     },
 *   );
 *
 * The harness reads `caseData.fixtureSlug` (set by the
 * callback-form fixture wrapper after the test calls
 * `harness.useFixture(slug)`) and copies
 * `<skill-root>/evals/fixtures/<slug>/` into the per-test
 * workspace before the agent runs. A legacy `caseData.setup`
 * shell-script field is still honored for the data-array
 * `describeEval` compat path.
 *
 * After the agent runs, the harness captures any text files the
 * agent created or modified and exposes them on
 * `HarnessRun.artifacts` so LLM judges can grade the deliverable
 * directly (not just the chat transcript).
 */

import { cpSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
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
  /**
   * Slug under `<skill-root>/evals/fixtures/<slug>/`. When set, the
   * harness recursively copies that directory tree into the per-test
   * workspace before running the agent. Preferred over `setup` for
   * eval-gen-produced cases.
   */
  fixtureSlug?: string;
  /**
   * Optional shell setup script run in the workspace before the agent.
   * Legacy path for hand-authored cases without a fixture tree on
   * disk; eval-gen produces `fixtureSlug` instead.
   */
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

/**
 * Env var that overrides which skill the harness loads. Set by
 * `skillet eval <a> --against <b>` so case data from skill A runs
 * against skill B's SKILL.md as the system prompt — a fair
 * head-to-head where the only variable is the skill body.
 */
export const COMPARE_SKILL_ENV = "SKILLET_COMPARE_SKILL";

/**
 * Recursively copy `<skillPath>/evals/fixtures/<slug>/` into the
 * per-test workspace. Throws a clear error when the slug doesn't
 * resolve so authors find typos at test time, not silently.
 */
const copyFixtureTree = (skillPath: string, slug: string, workspaceDir: string): void => {
  const root = join(skillPath, "evals", "fixtures", slug);
  if (!existsSync(root)) {
    throw new Error(
      `harness.useFixture("${slug}"): no such fixture (looked under ${root}). Generate or hand-write the fixture tree, or use a different slug.`,
    );
  }
  const stat = statSync(root);
  if (!stat.isDirectory()) {
    throw new Error(
      `harness.useFixture("${slug}"): expected a directory at ${root} but found a file.`,
    );
  }
  cpSync(root, workspaceDir, { recursive: true });
};

export const skilletHarness = (opts: SkilletHarnessOptions): Harness<string, SkilletCase> => {
  const override = process.env[COMPARE_SKILL_ENV];
  const skillPath = override != null && override !== "" ? override : opts.skill;
  const skill = loadSkill(skillPath);
  const defaultTimeout = opts.defaultTimeout ?? 180_000;

  return {
    name: "skillet",
    run: async (input: string, ctx: HarnessContext<SkilletCase>): Promise<HarnessRun> => {
      if (!isSkilletCase(ctx.caseData)) {
        throw new Error("skilletHarness: case input must be a string");
      }
      const setup = ctx.caseData.setup;
      const fixtureSlug = ctx.caseData.fixtureSlug;
      const timeout = ctx.caseData.timeout ?? defaultTimeout;
      const explicitArtifacts = ctx.caseData.artifacts;

      const workspace = createWorkspace(setup != null ? { setup } : undefined);

      // Copy the per-case fixture tree into the workspace AFTER
      // createWorkspace runs (so any legacy `setup` script ran first
      // and the workspace dir exists). The fixture tree is a real
      // directory at `<skillPath>/evals/fixtures/<slug>/`; we
      // mirror it into `workspace.dir`.
      if (fixtureSlug != null && fixtureSlug !== "") {
        copyFixtureTree(skillPath, fixtureSlug, workspace.dir);
      }

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
          messages: result.messages,
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
