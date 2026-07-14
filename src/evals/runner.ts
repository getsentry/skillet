/**
 * Agentless analysis of eval cases. Actual execution lives in
 * src/engine/ (Vitest + vitest-evals); this module keeps the --dry
 * path, which must never spawn an agent or touch the engine.
 */
import type { Check, EvalCase } from "./case.js";
import { runCheck } from "./checks.js";
import { SetupError, createWorkspace } from "./workspace.js";

export interface DryCaseResult {
  id: string;
  behavior: string;
  /** Deterministic checks that pass with no agent run (invariant guards, or bugs). */
  pristinePass: Check[];
  deterministic: number;
  /** Judge checks can't be dry-run; reported so nobody assumes they were. */
  judges: number;
  /** True when a do-nothing agent would pass this case — the eval proves nothing. */
  vacuous: boolean;
  /** Set when the workspace could not be built — the case was not dry-run. */
  error?: string;
}

/**
 * Run every deterministic check against the pristine workspace, no
 * agent involved. Individual pristine-passers are fine (invariant
 * guards like "existing files unchanged" pass by design) — the defect
 * is a case where ALL of them pass, because then a do-nothing agent
 * scores a pass.
 */
export const dryRun = (cases: EvalCase[], skillRoot: string): DryCaseResult[] => {
  const results: DryCaseResult[] = [];
  for (const evalCase of cases) {
    const deterministicCount = evalCase.checks.filter((c) => c.kind !== "judge").length;
    const judgeCount = evalCase.checks.length - deterministicCount;
    let workspace;
    try {
      workspace = createWorkspace({
        skillRoot,
        ...(evalCase.fixture != null && { fixture: evalCase.fixture }),
        ...(evalCase.setup != null && { setup: evalCase.setup }),
      });
    } catch (error) {
      if (error instanceof SetupError) {
        results.push({
          id: evalCase.id,
          behavior: evalCase.behavior,
          pristinePass: [],
          deterministic: deterministicCount,
          judges: judgeCount,
          vacuous: false,
          error: error.message,
        });
        continue;
      }
      throw error;
    }
    try {
      const deterministic = evalCase.checks.filter((c) => c.kind !== "judge");
      const pristinePass = deterministic.filter(
        (check) => runCheck(check, workspace.dir).status === "pass",
      );
      results.push({
        id: evalCase.id,
        behavior: evalCase.behavior,
        pristinePass,
        deterministic: deterministic.length,
        judges: judgeCount,
        vacuous: deterministic.length > 0 && pristinePass.length === deterministic.length,
      });
    } finally {
      workspace.cleanup();
    }
  }
  return results;
};
