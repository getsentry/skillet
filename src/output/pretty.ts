import type { EvalCaseResult, EvalRunResult } from "../eval/types.js";

const statusIcon = (status: string): string => {
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
};

export const printCaseResult = (result: EvalCaseResult): void => {
  const icon = statusIcon(result.status);
  const duration = `${(result.duration / 1000).toFixed(1)}s`;
  const toolCount = result.usage.toolCalls;
  const tools = toolCount != null && toolCount > 0 ? ` (${toolCount} tool calls)` : "";

  console.log(`${icon} ${result.name}  ${duration}${tools}`);

  if (result.status === "skip" && result.skipReason != null) {
    console.log(`  skipped: ${result.skipReason}`);
  }

  if (result.status === "fail") {
    for (const check of result.checks) {
      if (!check.passed) {
        console.log(`  FAIL: ${check.detail}`);
      }
    }
    if (result.judge != null) {
      console.log(
        `  Judge: ${result.judge.grade} (${result.judge.score}) — ${result.judge.reasoning}`,
      );
    }
  }

  if (result.status === "error" && result.errors.length > 0) {
    for (const err of result.errors) {
      console.log(`  ERROR: ${err.message}`);
    }
  }
};

export const printSummary = (result: EvalRunResult): void => {
  const { summary } = result;
  console.log(`\n${"─".repeat(50)}`);
  console.log(
    `Results: ${summary.pass} passed, ${summary.fail} failed, ${summary.skip} skipped, ${summary.error} errors`,
  );
  console.log(`Duration: ${(summary.durationMs / 1000).toFixed(1)}s`);
  console.log();
};
