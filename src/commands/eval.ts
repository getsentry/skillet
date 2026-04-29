import { resolve } from "node:path";
import { findSkillRoot, loadSkill } from "../skill/loader.js";
import { runVitestEvals } from "../eval/vitest-runner.js";
import { printCaseResult, printSummary } from "../output/pretty.js";
import { printJsonResult } from "../output/json.js";

const errorMessage = (err: unknown): string => {
  return err instanceof Error ? err.message : String(err);
};

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

  if (!jsonOutput) {
    console.log(`\nSkill: ${skill.meta.name}`);
    console.log(`Root:  ${skill.root}\n`);
  }

  const result = await runVitestEvals({
    skillRoot,
    onCaseComplete: jsonOutput ? undefined : printCaseResult,
  });

  if (result.cases.length === 0) {
    if (jsonOutput) {
      printJsonResult(result);
    } else {
      console.log("No eval files found in evals/ (looking for *.eval.ts).");
    }
    return 0;
  }

  if (jsonOutput) {
    printJsonResult(result);
  } else {
    printSummary(result);
  }

  return result.summary.fail + result.summary.error > 0 ? 1 : 0;
};
