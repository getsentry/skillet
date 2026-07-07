import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Check } from "./case.js";

export type CheckStatus = "pass" | "fail" | "skipped" | "error";

export interface CheckResult {
  kind: Check["kind"];
  value: string;
  status: CheckStatus;
  /** Command output or judge reasoning, present on non-pass results. */
  output?: string;
}

export const SHELL_CHECK_TIMEOUT_MS = 60_000;

/**
 * Run one deterministic check inside the workspace. Judge checks are
 * not handled here — the runner grades them through the harness, and
 * only after every deterministic check passed (judge spec).
 */
export const runDeterministicCheck = (check: Check, workspace: string): CheckResult => {
  if (check.kind === "file_exists") {
    const pass = existsSync(join(workspace, check.value));
    return {
      kind: check.kind,
      value: check.value,
      status: pass ? "pass" : "fail",
      ...(pass ? {} : { output: `no such path in workspace: ${check.value}` }),
    };
  }

  if (check.kind === "shell") {
    try {
      execFileSync("sh", ["-c", check.value], {
        cwd: workspace,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: SHELL_CHECK_TIMEOUT_MS,
      });
      return { kind: check.kind, value: check.value, status: "pass" };
    } catch (err) {
      const parts: string[] = [];
      if (err != null && typeof err === "object") {
        if ("status" in err && typeof err.status === "number") parts.push(`exit ${err.status}`);
        if ("stdout" in err && err.stdout instanceof Buffer) {
          const text = err.stdout.toString().trim();
          if (text !== "") parts.push(text);
        }
        if ("stderr" in err && err.stderr instanceof Buffer) {
          const text = err.stderr.toString().trim();
          if (text !== "") parts.push(text);
        }
      }
      if (parts.length === 0) parts.push(String(err));
      return {
        kind: check.kind,
        value: check.value,
        status: "fail",
        output: parts.join("\n").slice(0, 2000),
      };
    }
  }

  return { kind: check.kind, value: check.value, status: "skipped" };
};
