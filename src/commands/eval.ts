import { resolve } from "node:path";
import { findSkillRoot, loadSkill } from "../skill/loader.js";
import { resolveModels } from "../agent/provider.js";
import { runEvals, type CaseResult } from "../eval/runner.js";

export async function evalCommand(pathArg?: string): Promise<number> {
  const startPath = resolve(pathArg || ".");

  // 1. Find and load skill
  let skillRoot: string;
  try {
    skillRoot = findSkillRoot(startPath);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    return 1;
  }

  const skill = loadSkill(skillRoot);
  console.log(`\nSkill: ${skill.meta.name}`);
  console.log(`Root:  ${skill.root}\n`);

  // 2. Resolve LLM models
  let models;
  try {
    models = resolveModels();
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    return 1;
  }

  // 3. Run evals
  const result = await runEvals({
    skill,
    agentModel: models.agent,
    judgeModel: models.judge,
    onCaseComplete: printCaseResult,
  });

  if (result.cases.length === 0) {
    console.log("No eval files found.");
    return 0;
  }

  // 4. Print summary
  printSummary(result.cases, result.totalDuration);

  const failed = result.cases.filter((c) => c.status === "fail" || c.status === "error");
  return failed.length > 0 ? 1 : 0;
}

function printCaseResult(result: CaseResult): void {
  const icon = statusIcon(result.status);
  const duration = `${(result.duration / 1000).toFixed(1)}s`;
  const tools = result.toolCallCount !== undefined ? ` (${result.toolCallCount} tool calls)` : "";

  console.log(`${icon} ${result.name}  ${duration}${tools}`);

  if (result.status === "skip" && result.skipReason) {
    console.log(`  skipped: ${result.skipReason}`);
  }

  if (result.status === "fail") {
    // Show failed checks
    if (result.checkResults) {
      for (const check of result.checkResults) {
        if (!check.passed) {
          console.log(`  FAIL: ${check.detail}`);
        }
      }
    }
    // Show judge result
    if (result.judgeResult) {
      console.log(
        `  Judge: ${result.judgeResult.grade} (${result.judgeResult.score}) — ${result.judgeResult.reasoning}`
      );
    }
  }

  if (result.status === "error" && result.error) {
    console.log(`  ERROR: ${result.error}`);
  }
}

function printSummary(cases: CaseResult[], totalDuration: number): void {
  const pass = cases.filter((c) => c.status === "pass").length;
  const fail = cases.filter((c) => c.status === "fail").length;
  const skip = cases.filter((c) => c.status === "skip").length;
  const errors = cases.filter((c) => c.status === "error").length;

  console.log(`\n${"─".repeat(50)}`);
  console.log(
    `Results: ${pass} passed, ${fail} failed, ${skip} skipped, ${errors} errors`
  );
  console.log(`Duration: ${(totalDuration / 1000).toFixed(1)}s`);
  console.log();
}

function statusIcon(status: string): string {
  switch (status) {
    case "pass":
      return "\x1b[32m✓\x1b[0m";
    case "fail":
      return "\x1b[31m✗\x1b[0m";
    case "skip":
      return "\x1b[33m○\x1b[0m";
    case "error":
      return "\x1b[31m!\x1b[0m";
    default:
      return "?";
  }
}
