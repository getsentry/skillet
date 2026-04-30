import { resolve } from "node:path";
import { findSkillRoot, loadSkill } from "../skill/loader.js";
import { discoverEvalTsFiles } from "../eval/discovery.js";
import { runVitestEvals } from "../eval/vitest-runner.js";
import { printSummary } from "../output/pretty.js";
import { printJsonResult } from "../output/json.js";

const errorMessage = (err: unknown): string => {
  return err instanceof Error ? err.message : String(err);
};

export const EVAL_USAGE = `Usage: skillet eval [path] [--json]

Run vitest-driven evals on a skill. Cases run via the centralized AI
job queue (configurable with --ai-concurrency or SKILLET_AI_CONCURRENCY).`;

export const evalCommand = async (pathArg?: string, jsonOutput = false): Promise<number> => {
  const startPath = resolve(pathArg ?? ".");

  let skillRoot: string;
  try {
    skillRoot = findSkillRoot(startPath);
  } catch (err: unknown) {
    console.error(`Error: ${errorMessage(err)}`);
    return 1;
  }

  const skill = loadSkill(skillRoot);

  const evalFiles = discoverEvalTsFiles(skillRoot);
  if (evalFiles.length === 0) {
    if (jsonOutput) {
      printJsonResult({
        cases: [],
        summary: { total: 0, pass: 0, fail: 0, skip: 0, error: 0, durationMs: 0 },
      });
    } else {
      console.log(`\nSkill: ${skill.meta.name}`);
      console.log(`Root:  ${skill.root}\n`);
      console.log("No eval files found in evals/ (looking for *.eval.ts).");
    }
    return 0;
  }

  if (!jsonOutput) {
    console.log(`\nSkill: ${skill.meta.name}`);
    console.log(`Root:  ${skill.root}`);
    console.log(`Eval files: ${evalFiles.length}\n`);
  }

  let result;
  try {
    result = await runVitestEvals({
      skillRoot,
      streamProgress: !jsonOutput,
    });
  } catch (err: unknown) {
    if (jsonOutput) {
      console.log(JSON.stringify({ ok: false, error: errorMessage(err), evalFiles }, null, 2));
    } else {
      console.error(`Error: ${errorMessage(err)}`);
    }
    return 1;
  }

  if (jsonOutput) {
    printJsonResult(result);
  } else {
    printSummary(result);
  }

  return result.summary.fail + result.summary.error > 0 ? 1 : 0;
};
