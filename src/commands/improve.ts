import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { authorSkill } from "../authoring/loop.js";
import { findSkillRoot } from "../skill/loader.js";
import { specFileName } from "../spec/index.js";

export interface ImproveOptions {
  path?: string;
  maxIterations?: number;
}

const parseImproveArgs = (args: string[]): ImproveOptions => {
  const path = args.find((a) => !a.startsWith("--"));
  const iterFlag = args.find((a) => a.startsWith("--max-iterations="));
  const maxIterations = iterFlag != null ? parseInt(iterFlag.split("=")[1] ?? "", 10) : undefined;

  const opts: ImproveOptions = {};
  if (path != null) opts.path = path;
  if (maxIterations != null && !Number.isNaN(maxIterations)) opts.maxIterations = maxIterations;
  return opts;
};

export const IMPROVE_USAGE = `Usage: skillet improve [path] [--max-iterations N]

Iterate on an existing skill until per-behavior evals pass. Auto-imports
legacy skills (SKILL.md without spec.yaml).`;

export const improveCommand = async (args: string[]): Promise<number> => {
  const opts = parseImproveArgs(args);
  const startPath = resolve(opts.path ?? ".");

  // Find the skill root by walking up looking for either spec.yaml or
  // SKILL.md. The loop handles auto-import when only SKILL.md exists.
  let skillRoot: string;
  if (existsSync(join(startPath, specFileName()))) {
    skillRoot = startPath;
  } else {
    try {
      skillRoot = findSkillRoot(startPath);
    } catch {
      console.error(`Error: No spec.yaml or SKILL.md found at ${startPath}`);
      console.error("Use 'skillet create <description>' to create a new skill.");
      return 1;
    }
  }

  try {
    const result = await authorSkill({
      mode: "improve",
      path: skillRoot,
      ...(opts.maxIterations != null ? { maxIterations: opts.maxIterations } : {}),
    });

    return result.success ? 0 : 1;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    return 1;
  }
};
