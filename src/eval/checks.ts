import { execSync } from "node:child_process";
import type { Check, WorkspaceCheck } from "./parser.js";
import {
  isWorkspaceCheck,
  isOutputContains,
  isOutputNotContains,
  isOutputMatches,
} from "./parser.js";

export interface CheckResult {
  passed: boolean;
  check: Check;
  detail?: string;
}

const isExecError = (
  err: unknown,
): err is { status: number | null; stderr: Buffer | null; stdout: Buffer | null } => {
  return err != null && typeof err === "object" && "status" in err;
};

/**
 * Run a single workspace check (shell command) in the given directory.
 */
const runWorkspaceCheck = (check: WorkspaceCheck, workDir: string): CheckResult => {
  let stdout = "";
  let exitCode = 0;

  try {
    const result = execSync(check.run, {
      cwd: workDir,
      stdio: "pipe",
      timeout: 10_000,
      env: { ...process.env },
    });
    stdout = result.toString();
  } catch (err: unknown) {
    if (isExecError(err)) {
      exitCode = err.status ?? 1;
      stdout = err.stdout?.toString() ?? "";
    } else {
      exitCode = 1;
      stdout = "";
    }
  }

  const trimmed = stdout.trimEnd();

  // Exit code check
  if (check.exits !== undefined) {
    return {
      passed: exitCode === check.exits,
      check,
      detail: `exit code: ${exitCode} (expected ${check.exits})`,
    };
  }

  // Regex match
  if (check.matches !== undefined) {
    const re = new RegExp(check.matches, "m");
    const passed = re.test(trimmed);
    return {
      passed,
      check,
      detail: passed
        ? `matched /${check.matches}/`
        : `stdout "${truncate(trimmed)}" did not match /${check.matches}/`,
    };
  }

  // Contains
  if (check.contains !== undefined) {
    const passed = trimmed.includes(check.contains);
    return {
      passed,
      check,
      detail: passed
        ? `contains "${check.contains}"`
        : `stdout "${truncate(trimmed)}" does not contain "${check.contains}"`,
    };
  }

  // Not contains
  if (check.not_contains !== undefined) {
    const passed = !trimmed.includes(check.not_contains);
    return {
      passed,
      check,
      detail: passed
        ? `does not contain "${check.not_contains}"`
        : `stdout "${truncate(trimmed)}" contains "${check.not_contains}" (unexpected)`,
    };
  }

  // Equals
  if (check.equals !== undefined) {
    const passed = trimmed === check.equals.trim();
    return {
      passed,
      check,
      detail: passed
        ? `equals "${check.equals}"`
        : `stdout "${truncate(trimmed)}" does not equal "${check.equals}"`,
    };
  }

  // Not equals
  if (check.not_equals !== undefined) {
    const passed = trimmed !== check.not_equals.trim();
    return {
      passed,
      check,
      detail: passed
        ? `does not equal "${check.not_equals}"`
        : `stdout equals "${check.not_equals}" (unexpected)`,
    };
  }

  return { passed: true, check, detail: "no assertion specified" };
};

/**
 * Run all checks for an eval case.
 */
export const runChecks = (checks: Check[], workDir: string, agentOutput: string): CheckResult[] => {
  const results: CheckResult[] = [];

  for (const check of checks) {
    if (isWorkspaceCheck(check)) {
      results.push(runWorkspaceCheck(check, workDir));
    } else if (isOutputContains(check)) {
      const passed = agentOutput.includes(check.output_contains);
      results.push({
        passed,
        check,
        detail: passed
          ? `output contains "${check.output_contains}"`
          : `output does not contain "${check.output_contains}"`,
      });
    } else if (isOutputNotContains(check)) {
      const passed = !agentOutput.includes(check.output_not_contains);
      results.push({
        passed,
        check,
        detail: passed
          ? `output does not contain "${check.output_not_contains}"`
          : `output contains "${check.output_not_contains}" (unexpected)`,
      });
    } else if (isOutputMatches(check)) {
      const re = new RegExp(check.output_matches, "m");
      const passed = re.test(agentOutput);
      results.push({
        passed,
        check,
        detail: passed
          ? `output matches /${check.output_matches}/`
          : `output does not match /${check.output_matches}/`,
      });
    }
  }

  return results;
};

const truncate = (s: string, max = 120): string => {
  return s.length > max ? s.slice(0, max) + "..." : s;
};
