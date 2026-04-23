import { resolve } from "node:path";
import { findSkillRoot } from "../skill/loader.js";

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
    console.error("Use 'skillkit create <description>' to create a new skill.");
    return 1;
  }

  // TODO: call authorSkill({ mode: "improve", ... })
  console.log(`improve command not yet fully implemented (skill root: ${skillRoot})`);
  return 1;
};
