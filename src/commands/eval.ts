import { resolve } from "node:path";
import { findSkillRoot, loadSkill } from "../skill/loader.js";
import { resolveModels } from "../agent/provider.js";
import { runEvals } from "../eval/index.js";
import { printCaseResult, printSummary } from "../output/pretty.js";
import { printJsonResult } from "../output/json.js";

const errorMessage = (err: unknown): string => {
  return err instanceof Error ? err.message : String(err);
};

export const evalCommand = async (pathArg?: string, jsonOutput = false): Promise<number> => {
  const startPath = resolve(pathArg ?? ".");

  // 1. Find and load skill
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

  // 2. Resolve LLM models
  let models: ReturnType<typeof resolveModels>;
  try {
    models = resolveModels();
  } catch (err: unknown) {
    console.error(`Error: ${errorMessage(err)}`);
    return 1;
  }

  // 3. Run evals
  const result = await runEvals({
    skill,
    agentModel: models.agent,
    judgeModel: models.judge,
    onCaseComplete: jsonOutput ? undefined : printCaseResult,
    onToolCall: jsonOutput
      ? undefined
      : (caseName, toolName, step) => {
          process.stderr.write(`\x1b[2m  [${caseName}] step ${step}: ${toolName}\x1b[0m\r`);
        },
  });

  if (result.cases.length === 0) {
    if (jsonOutput) {
      printJsonResult(result);
    } else {
      console.log("No eval files found.");
    }
    return 0;
  }

  // 4. Output results
  if (jsonOutput) {
    printJsonResult(result);
  } else {
    printSummary(result);
  }

  return result.summary.fail + result.summary.error > 0 ? 1 : 0;
};
