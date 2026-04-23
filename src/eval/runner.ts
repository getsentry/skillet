import type { AnyModel } from "../agent/provider.js";
import type { Skill } from "../skill/loader.js";
import type { EvalCase, EvalFile } from "./parser.js";
import type { CheckResult } from "./checks.js";
import type { JudgeResult } from "./judge.js";
import { discoverEvalFiles, parseEvalFile } from "./parser.js";
import { createWorkspace, SkipError, type Workspace } from "./workspace.js";
import { checkRequirements } from "./requirements.js";
import { runChecks } from "./checks.js";
import { judge } from "./judge.js";
import { runAgent } from "../agent/loop.js";

// ── Result types ──────────────────────────────────────────

export type CaseStatus = "pass" | "fail" | "skip" | "error";

export interface CaseResult {
  name: string;
  file: string;
  status: CaseStatus;
  duration: number;
  /** Why it was skipped */
  skipReason?: string;
  /** Error message if status is 'error' */
  error?: string;
  /** Structural check results */
  checkResults?: CheckResult[];
  /** LLM judge result */
  judgeResult?: JudgeResult;
  /** Agent output text */
  agentOutput?: string;
  /** Number of tool calls */
  toolCallCount?: number;
}

export interface EvalRunResult {
  cases: CaseResult[];
  totalDuration: number;
}

// ── Runner ──────────────────────────────────────────────────

export interface RunEvalOptions {
  skill: Skill;
  agentModel: AnyModel;
  judgeModel: AnyModel;
  /** Called after each case completes */
  onCaseComplete?: (result: CaseResult) => void;
}

const errorMessage = (err: unknown): string => {
  return err instanceof Error ? err.message : String(err);
};

/**
 * Discover and run all eval cases for a skill.
 */
export const runEvals = async (opts: RunEvalOptions): Promise<EvalRunResult> => {
  const { skill, agentModel, judgeModel, onCaseComplete } = opts;

  const evalFilePaths = discoverEvalFiles(skill.root);
  if (evalFilePaths.length === 0) {
    return { cases: [], totalDuration: 0 };
  }

  const evalFiles: EvalFile[] = evalFilePaths.map(parseEvalFile);
  const allCases: CaseResult[] = [];
  const runStart = Date.now();

  for (const file of evalFiles) {
    for (const evalCase of file.cases) {
      const result = await runSingleCase({
        evalCase,
        filePath: file.path,
        skill,
        agentModel,
        judgeModel,
      });
      allCases.push(result);
      onCaseComplete?.(result);
    }
  }

  return {
    cases: allCases,
    totalDuration: Date.now() - runStart,
  };
};

const runSingleCase = async (opts: {
  evalCase: EvalCase;
  filePath: string;
  skill: Skill;
  agentModel: AnyModel;
  judgeModel: AnyModel;
}): Promise<CaseResult> => {
  const { evalCase, filePath, skill, agentModel, judgeModel } = opts;
  const start = Date.now();

  const base: Pick<CaseResult, "name" | "file"> = {
    name: evalCase.name,
    file: filePath,
  };

  // 1. Check requirements
  if (evalCase.requires != null && evalCase.requires.length > 0) {
    const skipReason = checkRequirements(evalCase.requires);
    if (skipReason != null) {
      return {
        ...base,
        status: "skip",
        duration: Date.now() - start,
        skipReason,
      };
    }
  }

  // 2. Set up workspace
  let workspace: Workspace;
  try {
    workspace = createWorkspace(evalCase.workspace);
  } catch (err: unknown) {
    if (err instanceof SkipError) {
      return {
        ...base,
        status: "skip",
        duration: Date.now() - start,
        skipReason: err.message,
      };
    }
    return {
      ...base,
      status: "error",
      duration: Date.now() - start,
      error: `Workspace setup failed: ${errorMessage(err)}`,
    };
  }

  try {
    // 3. Run agent
    const timeout = evalCase.timeout ?? 120_000;
    const agentResult = await runAgent({
      model: agentModel,
      skill,
      workDir: workspace.dir,
      turns: evalCase.turns,
      timeout,
    });

    // 4. Run structural checks
    let checkResults: CheckResult[] | undefined;
    if (evalCase.checks != null && evalCase.checks.length > 0) {
      checkResults = runChecks(evalCase.checks, workspace.dir, agentResult.output);
      const failed = checkResults.filter((r) => !r.passed);
      if (failed.length > 0) {
        return {
          ...base,
          status: "fail",
          duration: Date.now() - start,
          checkResults,
          agentOutput: agentResult.output,
          toolCallCount: agentResult.toolCallCount,
        };
      }
    }

    // 5. Run judge (only if criteria present and checks passed)
    let judgeResult: JudgeResult | undefined;
    if (evalCase.criteria != null && evalCase.criteria !== "") {
      const threshold = evalCase.threshold ?? 0.75;
      judgeResult = await judge(judgeModel, agentResult.output, evalCase.criteria);
      if (judgeResult.score < threshold) {
        return {
          ...base,
          status: "fail",
          duration: Date.now() - start,
          checkResults,
          judgeResult,
          agentOutput: agentResult.output,
          toolCallCount: agentResult.toolCallCount,
        };
      }
    }

    // All passed
    return {
      ...base,
      status: "pass",
      duration: Date.now() - start,
      checkResults,
      judgeResult,
      agentOutput: agentResult.output,
      toolCallCount: agentResult.toolCallCount,
    };
  } catch (err: unknown) {
    return {
      ...base,
      status: "error",
      duration: Date.now() - start,
      error: errorMessage(err),
    };
  } finally {
    workspace.cleanup();
  }
};
