import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CheckSpec } from "./case.js";

export type CheckStatus = "pass" | "fail" | "skipped" | "error";

export interface CheckResult {
  kind: CheckSpec["kind"];
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
export const runDeterministicCheck = (check: CheckSpec, workspace: string): CheckResult => {
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
        const e = err as { status?: number | null; stdout?: Buffer; stderr?: Buffer };
        if (e.status != null) parts.push(`exit ${e.status}`);
        const stdout = e.stdout?.toString().trim();
        const stderr = e.stderr?.toString().trim();
        if (stdout) parts.push(stdout);
        if (stderr) parts.push(stderr);
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
