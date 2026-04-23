import { resolve } from "node:path";
import { findSkillRoot } from "../skill/loader.js";
import { authorSkill } from "../authoring/loop.js";

export interface ImproveOptions {
  path?: string;
  maxIterations?: number;
}

const parseImproveArgs = (args: string[]): ImproveOptions => {
  const path = args.find((a) => !a.startsWith("--"));

  const iterFlag = args.find((a) => a.startsWith("--max-iterations="));
  const maxIterations = iterFlag != null ? parseInt(iterFlag.split("=")[1] ?? "", 10) : undefined;

  return { path, maxIterations };
};

export const improveCommand = async (args: string[]): Promise<number> => {
  const opts = parseImproveArgs(args);
  const startPath = resolve(opts.path ?? ".");

  let skillRoot: string;
  try {
    skillRoot = findSkillRoot(startPath);
  } catch {
    console.error(`Error: No SKILL.md found at ${startPath}`);
    console.error("Use 'skillet create <description>' to create a new skill.");
    return 1;
  }

  try {
    const result = await authorSkill({
      mode: "improve",
      path: skillRoot,
      maxIterations: opts.maxIterations,
    });

    return result.success ? 0 : 1;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    return 1;
  }
};
