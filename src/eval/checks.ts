import { execSync } from "node:child_process";
import type { Check, WorkspaceCheck } from "./parser.js";
import {
  isWorkspaceCheck,
  isOutputContains,
  isOutputNotContains,
  isOutputMatches,
} from "./parser.js";

export interface CheckResult {
  name: string;
  passed: boolean;
  check: Check;
  detail: string;
}

/**
 * Build a RegExp from a pattern string, handling Python-style inline flags
 * like (?i) that JS doesn't support. Converts them to JS RegExp flags.
 */
const buildRegex = (pattern: string, baseFlags = "m"): RegExp => {
  let flags = baseFlags;
  let cleaned = pattern;

  // Extract (?i), (?s), (?m) prefixes and convert to JS flags
  const inlineMatch = /^\(\?([ims]+)\)/.exec(cleaned);
  if (inlineMatch?.[1] != null) {
    for (const ch of inlineMatch[1]) {
      if (ch === "i" && !flags.includes("i")) {
        flags += "i";
      }
      if (ch === "s" && !flags.includes("s")) {
        flags += "s";
      }
      // (?m) in Python = multiline, already in baseFlags
    }
    cleaned = cleaned.slice(inlineMatch[0].length);
  }

  return new RegExp(cleaned, flags);
};

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
      name: `run: ${check.run} (exits)`,
      passed: exitCode === check.exits,
      check,
      detail: `exit code: ${exitCode} (expected ${check.exits})`,
    };
  }

  // Without an explicit `exits` assertion, a non-zero exit is itself a failure.
  // Otherwise empty stdout from a failed command can make assertions like
  // not_contains silently pass (e.g. `cat missing-file` → "" does not contain X).
  if (exitCode !== 0) {
    return {
      name: `run: ${check.run}`,
      passed: false,
      check,
      detail: `command failed with exit code ${exitCode}`,
    };
  }

  // Regex match
  if (check.matches !== undefined) {
    const re = buildRegex(check.matches);
    const passed = re.test(trimmed);
    return {
      name: `run: ${check.run} (matches)`,
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
      name: `run: ${check.run} (contains)`,
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
      name: `run: ${check.run} (not_contains)`,
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
      name: `run: ${check.run} (equals)`,
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
      name: `run: ${check.run} (not_equals)`,
      passed,
      check,
      detail: passed
        ? `does not equal "${check.not_equals}"`
        : `stdout equals "${check.not_equals}" (unexpected)`,
    };
  }

  return { name: `run: ${check.run}`, passed: true, check, detail: "no assertion specified" };
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
        name: "output_contains",
        passed,
        check,
        detail: passed
          ? `output contains "${check.output_contains}"`
          : `output does not contain "${check.output_contains}"`,
      });
    } else if (isOutputNotContains(check)) {
      const passed = !agentOutput.includes(check.output_not_contains);
      results.push({
        name: "output_not_contains",
        passed,
        check,
        detail: passed
          ? `output does not contain "${check.output_not_contains}"`
          : `output contains "${check.output_not_contains}" (unexpected)`,
      });
    } else if (isOutputMatches(check)) {
      const re = buildRegex(check.output_matches);
      const passed = re.test(agentOutput);
      results.push({
        name: "output_matches",
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
