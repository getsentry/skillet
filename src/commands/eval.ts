import { resolve, join } from "node:path";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
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

  // Set up trace directory for per-case output files
  const traceDir = join(tmpdir(), `skillet-trace-${Date.now()}`);
  mkdirSync(traceDir, { recursive: true });

  if (!jsonOutput) {
    console.log(`\nSkill: ${skill.meta.name}`);
    console.log(`Root:  ${skill.root}`);
    console.log(`Trace: ${traceDir}\n`);
  }

  // 2. Resolve LLM models
  let models: ReturnType<typeof resolveModels>;
  try {
    models = resolveModels();
  } catch (err: unknown) {
    console.error(`Error: ${errorMessage(err)}`);
    return 1;
  }

  // 3. Run evals — tool call progress is buffered per case and printed on completion
  const toolCallBuffers = new Map<string, string[]>();

  const result = await runEvals({
    skill,
    agentModel: models.agent,
    judgeModel: models.judge,
    traceDir,
    onCaseComplete: jsonOutput
      ? undefined
      : (caseResult) => {
          // Print buffered tool calls for this case, then the result
          const buffer = toolCallBuffers.get(caseResult.name);
          if (buffer != null && buffer.length > 0) {
            for (const line of buffer) {
              process.stderr.write(line);
            }
          }
          toolCallBuffers.delete(caseResult.name);
          printCaseResult(caseResult);
        },
    onToolCall: jsonOutput
      ? undefined
      : (caseName, toolName, step) => {
          const line = `\x1b[2m    [${caseName}] step ${step}: ${toolName}\x1b[0m\n`;
          const existing = toolCallBuffers.get(caseName);
          if (existing != null) {
            existing.push(line);
          } else {
            toolCallBuffers.set(caseName, [line]);
          }
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
