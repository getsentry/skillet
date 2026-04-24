import type { AnyModel } from "../agent/provider.js";
import type { Skill } from "../skill/loader.js";
import type { EvalCase, EvalFile } from "./parser.js";
import type {
  EvalCaseResult,
  EvalRunResult,
  NormalizedSession,
  UsageSummary,
  CheckResultNormalized,
  JudgeResultNormalized,
} from "./types.js";
import { discoverEvalFiles, parseEvalFile } from "./parser.js";
import { createWorkspace, SkipError, type Workspace } from "./workspace.js";
import { checkRequirements } from "./requirements.js";
import { runChecks } from "./checks.js";
import { judge } from "./judge.js";
import { runAgent } from "../agent/loop.js";

// ── Runner options ────────────────────────────────────────

export interface RunEvalOptions {
  skill: Skill;
  agentModel: AnyModel;
  judgeModel: AnyModel;
  /** Called after each case completes */
  onCaseComplete?: (result: EvalCaseResult) => void;
  /** Called on each tool call for live progress */
  onToolCall?: (caseName: string, toolName: string, step: number) => void;
}

const errorMessage = (err: unknown): string => {
  return err instanceof Error ? err.message : String(err);
};

const emptySession: NormalizedSession = { messages: [] };
const emptyUsage: UsageSummary = {};

/**
 * Discover and run all eval cases for a skill.
 */
export const runEvals = async (opts: RunEvalOptions): Promise<EvalRunResult> => {
  const { skill, agentModel, judgeModel, onCaseComplete, onToolCall } = opts;

  const evalFilePaths = discoverEvalFiles(skill.root);
  if (evalFilePaths.length === 0) {
    return {
      cases: [],
      summary: { total: 0, pass: 0, fail: 0, skip: 0, error: 0, durationMs: 0 },
    };
  }

  const evalFiles: EvalFile[] = evalFilePaths.map(parseEvalFile);
  const allCases: EvalCaseResult[] = [];
  const runStart = Date.now();

  // Collect all cases across files
  const caseEntries: Array<{ evalCase: EvalCase; filePath: string }> = [];
  for (const file of evalFiles) {
    for (const evalCase of file.cases) {
      caseEntries.push({ evalCase, filePath: file.path });
    }
  }

  // Run all cases in parallel
  const promises = caseEntries.map(({ evalCase, filePath }) =>
    runSingleCase({
      evalCase,
      filePath,
      skill,
      agentModel,
      judgeModel,
      onToolCall,
    }).then((result) => {
      onCaseComplete?.(result);
      return result;
    }),
  );

  const results = await Promise.all(promises);
  allCases.push(...results);

  const durationMs = Date.now() - runStart;

  return {
    cases: allCases,
    summary: {
      total: allCases.length,
      pass: allCases.filter((c) => c.status === "pass").length,
      fail: allCases.filter((c) => c.status === "fail").length,
      skip: allCases.filter((c) => c.status === "skip").length,
      error: allCases.filter((c) => c.status === "error").length,
      durationMs,
    },
  };
};

const runSingleCase = async (opts: {
  evalCase: EvalCase;
  filePath: string;
  skill: Skill;
  agentModel: AnyModel;
  judgeModel: AnyModel;
  onToolCall?: (caseName: string, toolName: string, step: number) => void;
}): Promise<EvalCaseResult> => {
  const { evalCase, filePath, skill, agentModel, judgeModel, onToolCall } = opts;
  const start = Date.now();

  const base = { name: evalCase.name, file: filePath };

  // 1. Check requirements
  if (evalCase.requires != null && evalCase.requires.length > 0) {
    const skipReason = checkRequirements(evalCase.requires);
    if (skipReason != null) {
      return {
        ...base,
        status: "skip",
        duration: Date.now() - start,
        session: emptySession,
        usage: emptyUsage,
        checks: [],
        errors: [],
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
        session: emptySession,
        usage: emptyUsage,
        checks: [],
        errors: [],
        skipReason: err.message,
      };
    }
    return {
      ...base,
      status: "error",
      duration: Date.now() - start,
      session: emptySession,
      usage: emptyUsage,
      checks: [],
      errors: [{ type: "WorkspaceError", message: `Workspace setup failed: ${errorMessage(err)}` }],
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
      onToolCall:
        onToolCall != null
          ? (name, step) => {
              onToolCall(evalCase.name, name, step);
            }
          : undefined,
    });

    const session: NormalizedSession = {
      messages: agentResult.messages,
      outputText: agentResult.output,
    };

    const usage: UsageSummary = {
      toolCalls: agentResult.toolCallCount,
    };

    // 4. Run structural checks
    let checks: CheckResultNormalized[] = [];
    if (evalCase.checks != null && evalCase.checks.length > 0) {
      const rawChecks = runChecks(evalCase.checks, workspace.dir, agentResult.output);
      checks = rawChecks.map((c) => ({ name: c.name, passed: c.passed, detail: c.detail }));
      const failed = checks.filter((c) => !c.passed);
      if (failed.length > 0) {
        return {
          ...base,
          status: "fail",
          duration: Date.now() - start,
          session,
          usage,
          checks,
          errors: [],
        };
      }
    }

    // 5. Run judge (only if criteria present and checks passed)
    let judgeNormalized: JudgeResultNormalized | undefined;
    if (evalCase.criteria != null && evalCase.criteria !== "") {
      const threshold = evalCase.threshold ?? 0.75;
      const judgeResult = await judge(judgeModel, agentResult.output, evalCase.criteria);
      judgeNormalized = {
        grade: judgeResult.grade,
        score: judgeResult.score,
        reasoning: judgeResult.reasoning,
      };
      if (judgeResult.score < threshold) {
        return {
          ...base,
          status: "fail",
          duration: Date.now() - start,
          session,
          usage,
          checks,
          judge: judgeNormalized,
          errors: [],
        };
      }
    }

    // All passed
    return {
      ...base,
      status: "pass",
      duration: Date.now() - start,
      session,
      usage,
      checks,
      judge: judgeNormalized,
      errors: [],
    };
  } catch (err: unknown) {
    return {
      ...base,
      status: "error",
      duration: Date.now() - start,
      session: emptySession,
      usage: emptyUsage,
      checks: [],
      errors: [{ type: "RuntimeError", message: errorMessage(err) }],
    };
  } finally {
    workspace.cleanup();
  }
};
