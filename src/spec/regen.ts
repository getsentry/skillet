import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AnyModel } from "../agent/provider.js";
import { runEvalGen } from "../authoring/phases/eval-gen.js";
import { runSkillGen } from "../authoring/phases/skill-gen.js";
import { event } from "../log.js";
import { readSpec, validateSpecObject } from "./index.js";
import type { SkillSpec } from "./types.js";

export interface RegenerateOptions {
  /** Model used by skill-gen (the heavier "agent" model). */
  model: AnyModel;
  /**
   * Model used for per-behavior eval-gen calls. Defaults to the
   * judge model, which is typically a fast/cheap model — the
   * single-behavior task is constrained enough that big models
   * are wasted on it.
   */
  evalGenModel?: AnyModel;
  /** Optional progress callback for CLI feedback. */
  onProgress?: (msg: string) => void;
}

export interface RegenerateResult {
  spec: SkillSpec;
  skillMdPath: string;
  /** Per-behavior eval files written this run (new only). */
  evalFilesWritten: string[];
  /** Behavior IDs whose eval file already existed and was preserved. */
  evalFilesSkipped: string[];
  /** Behavior IDs whose generation failed after retries. */
  evalFilesFailed: Array<{ id: string; error: string }>;
}

/**
 * Regenerate `SKILL.md` and per-behavior `evals/<id>.eval.ts` files
 * from `spec.yaml`. Called by every spec-mutating CLI path:
 *
 * - `skillet spec init`  — after writing the new spec
 * - `skillet spec refine` — after applying patches
 * - `skillet spec import` — after extracting from SKILL.md prose
 * - `skillet add-eval`    — after appending the new behavior
 * - The iteration loop    — after each round of assessment patches
 *
 * SKILL.md is rewritten on every run (it's a pure render of the spec).
 * Eval files are NEW-ONLY: existing `evals/<id>.eval.ts` files are
 * preserved so direct edits to prompts/setup/assertions survive.
 * Behaviors removed from the spec leave orphan files behind; verify
 * coverage flags them, the user deletes manually.
 *
 * Throws on invalid spec — callers should run verify before regen if
 * they want a clean upstream signal.
 */
export const regenerate = async (
  skillRoot: string,
  opts: RegenerateOptions,
): Promise<RegenerateResult> => {
  const { model, onProgress } = opts;
  const log = onProgress ?? ((): void => {});

  const specPath = join(skillRoot, "spec.yaml");
  const spec = readSpec(specPath);
  if (spec == null) {
    throw new Error(`regenerate: no spec.yaml at ${specPath}`);
  }

  const validation = validateSpecObject(spec, specPath);
  if (!validation.valid) {
    const summary = validation.errors.map((e) => `- ${e.message}`).join("\n");
    throw new Error(`regenerate: spec.yaml fails structural validation:\n${summary}`);
  }

  log("rendering SKILL.md from spec");
  const skillMd = await runSkillGen(model, spec);
  const skillMdPath = join(skillRoot, "SKILL.md");
  writeFileSync(skillMdPath, skillMd, "utf-8");
  log(`wrote ${skillMdPath}`);

  log("rendering eval cases from spec");
  const evalGenModel = opts.evalGenModel ?? model;
  const { written, skipped, failed } = await runEvalGen(evalGenModel, spec, skillRoot, {
    logProgress: log,
  });

  if (failed.length > 0) {
    event("warn", `eval-gen: ${failed.length} behavior(s) failed after retries`, {
      failed: failed.map((f) => `${f.id}: ${f.error}`),
    });
    // Throw only when EVERYTHING failed; partial success leaves the
    // generated files in place and the user can re-run to retry the
    // failed entries (regen is idempotent for entries with files).
    if (written.length === 0 && skipped.length === 0) {
      const summary = failed.map((f) => `  - ${f.id}: ${f.error}`).join("\n");
      throw new Error(`regenerate: eval-gen produced zero files\n${summary}`);
    }
  }

  return {
    spec,
    skillMdPath,
    evalFilesWritten: written,
    evalFilesSkipped: skipped,
    evalFilesFailed: failed,
  };
};
