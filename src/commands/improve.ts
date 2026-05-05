import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { authorSkillViaOrchestrator } from "../agents/author.js";
import { findSkillRoot } from "../skill/loader.js";
import { specFileName } from "../spec/index.js";
import { findPositional } from "./_args.js";

export interface ImproveOptions {
  path?: string;
}

const parseImproveArgs = (args: string[]): ImproveOptions => {
  const positional = findPositional(args, []);
  const opts: ImproveOptions = {};
  if (positional[0] != null) opts.path = positional[0];
  return opts;
};

export const IMPROVE_USAGE = `Usage: skillet improve [path]

Run the orchestrator (skill-writer + eval-writer + validators) against
an existing skill. Auto-imports legacy skills (SKILL.md without
spec.yaml). After re-rendering, runs vitest; if cases fail, runs the
orchestrator once more with the failing-eval transcripts threaded into
skill-writer's context.`;

export const improveCommand = async (args: string[]): Promise<number> => {
  const opts = parseImproveArgs(args);
  const startPath = resolve(opts.path ?? ".");

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
    const result = await authorSkillViaOrchestrator({
      mode: "improve",
      path: skillRoot,
    });
    return result.success ? 0 : 1;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    return 1;
  }
};
