import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AnyModel } from "../agent/provider.js";
import { runEvalGen } from "../authoring/phases/eval-gen.js";
import { EVAL_YAML_BANNER } from "../authoring/phases/eval-gen.js";
import { runSkillGen } from "../authoring/phases/skill-gen.js";
import { readSpec, validateSpecObject } from "./index.js";
import type { SkillSpec } from "./types.js";

export interface RegenerateOptions {
  /** LLM used by skill-gen and eval-gen. */
  model: AnyModel;
  /** Optional progress callback for CLI feedback. */
  onProgress?: (msg: string) => void;
}

export interface RegenerateResult {
  spec: SkillSpec;
  skillMdPath: string;
  evalYamlPath: string;
}

/**
 * Regenerate SKILL.md and `evals/basic.eval.yaml` from `spec.yaml`.
 * Pure function of the spec (modulo LLM determinism in the gen
 * prompts). Called by every spec-mutating CLI path:
 *
 * - `skillet spec init`  — after writing the new spec
 * - `skillet spec refine` — after applying patches
 * - `skillet spec import` — after extracting from SKILL.md prose
 * - `skillet add-eval`    — after appending the new behavior
 * - The iteration loop    — after each round of assessment patches
 *
 * Reads spec.yaml from disk, structurally validates, runs skill-gen
 * and eval-gen phases, writes the derived files. Throws on invalid
 * spec — callers should run verify before regen if they want a clean
 * upstream signal.
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
  const evalYamlBody = await runEvalGen(model, spec, {
    logProgress: log,
  });
  const evalsDir = join(skillRoot, "evals");
  mkdirSync(evalsDir, { recursive: true });
  const evalYamlPath = join(evalsDir, "basic.eval.yaml");
  writeFileSync(evalYamlPath, EVAL_YAML_BANNER + evalYamlBody, "utf-8");
  log(`wrote ${evalYamlPath}`);

  return { spec, skillMdPath, evalYamlPath };
};
