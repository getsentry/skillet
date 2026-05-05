/**
 * Orchestrator: drives the writer-fanout → validator-fanout →
 * re-pass loop defined in
 * openspec/changes/2026-05-04-agent-orchestration/design.md.
 *
 * Skill-writer and eval-writer run in parallel against `spec.yaml`,
 * then skill-validator and evals-validator run in parallel against
 * the writer outputs. Each writer-validator pair is independent —
 * a re-pass on one does not trigger the other.
 *
 * On `improve` mode, failing-eval transcripts thread into
 * skill-writer's extraContext only. Eval-writer is idempotent and
 * leaves existing eval files untouched (its own SKILL.md owns
 * that contract; the orchestrator does not enforce it).
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AnyModel } from "../agent/provider.js";
import type { EvalRunResult } from "../eval/index.js";
import { formatDiagnostics, parseDiagnostics } from "./diagnostics.js";
import { getBundledAgent } from "./registry.js";
import { runAgent } from "./runner.js";
import type { AgentRunContext, Diagnostics } from "./types.js";
import { hasErrors } from "./types.js";

export type OrchestratorMode = "create" | "improve" | "add-eval";

export interface OrchestratorOptions {
  /** Absolute path to the user's skill root. spec.yaml MUST exist. */
  skillRoot: string;
  mode: OrchestratorMode;
  /** Model used for every agent (writer + validator). */
  model: AnyModel;
  /**
   * Failing-eval result threaded into skill-writer's extraContext
   * on `improve` mode. Ignored for `create`/`add-eval`.
   */
  failingEvals?: EvalRunResult;
  /**
   * Maximum re-passes per writer per cycle. Default 1 — if a
   * validator still flags errors after one re-pass, surface and
   * stop.
   */
  maxRePassesPerWriter?: number;
  /** Outer abort signal. */
  signal?: AbortSignal;
  /** Optional progress callback for long-running CLI invocations. */
  onProgress?: (msg: string) => void;
}

export interface AgentRunRecord {
  agent: string;
  passNumber: number;
  toolCallCount: number;
  /**
   * True when the writer hit its tool-call cap mid-stream. The
   * orchestrator treats this as a continuation signal: even if
   * the validator's error count plateaus, another re-pass is
   * justified because the writer wasn't done.
   */
  capExhausted: boolean;
}

export interface OrchestratorResult {
  skillRoot: string;
  agentsRun: AgentRunRecord[];
  diagnostics: {
    skill: Diagnostics;
    evals: Diagnostics;
  };
  /** True when both validators returned ok (warnings allowed). */
  success: boolean;
}

// Eval-writer's bundled SKILL.md documents a multi-pass batching
// strategy for large suites: pass 1 writes _judges.ts, subsequent
// passes write eval files in batches. The orchestrator must allow
// enough re-passes for that to converge; with the default re-pass
// count of 1, large specs (>~25 entries) couldn't finish before the
// orchestrator gave up. We stop early when findings stop decreasing,
// so a stuck loop doesn't burn through all 4.
const DEFAULT_MAX_REPASSES = 4;

/** Append a CLI-readable progress line if a sink is provided. */
const tick = (opts: OrchestratorOptions, msg: string): void => {
  opts.onProgress?.(msg);
};

const formatFailingEvals = (run: EvalRunResult): string => {
  const failing = run.cases.filter((c) => c.status === "fail" || c.status === "error");
  if (failing.length === 0) return "";
  const blocks = failing.map((c) => {
    const lines = [`### ${c.name}`, `Status: ${c.status}`];
    if (c.judge != null) {
      lines.push(`Judge score: ${c.judge.score}`);
      if (c.judge.reasoning !== "") {
        lines.push(`Judge reasoning: ${c.judge.reasoning}`);
      }
    }
    if (c.errors.length > 0) {
      const errs = c.errors.map((e) => `  - ${e.message}`).join("\n");
      lines.push(`Errors:\n${errs}`);
    }
    return lines.join("\n");
  });
  return `## Failing evals from prior run\n\n${blocks.join("\n\n")}`;
};

/** Run a single writer agent pass, return the run record. */
const runWriter = async (
  opts: OrchestratorOptions,
  agentName: "skill-writer" | "eval-writer",
  passNumber: number,
  extraContext: string | undefined,
): Promise<AgentRunRecord> => {
  const def = getBundledAgent(agentName);
  // Writers may write anywhere under the skill root EXCEPT spec.yaml.
  // Path scoping enforces "under skillRoot"; the spec-immutability
  // rule lives in the agent's SKILL.md (and we double-check at the
  // CLI boundary by snapshotting spec.yaml before/after — TBD).
  const ctx: AgentRunContext = {
    skillRoot: opts.skillRoot,
    writeScope: [opts.skillRoot],
    ...(extraContext != null && extraContext !== "" ? { extraContext } : {}),
    ...(opts.signal != null ? { signal: opts.signal } : {}),
  };
  tick(opts, `[orchestrator] ${agentName} pass ${passNumber}…`);
  const result = await runAgent(opts.model, def, ctx);
  if (result.capExhausted) {
    tick(
      opts,
      `[orchestrator] ${agentName}: tool budget exhausted on pass ${passNumber} — partial output, will re-pass`,
    );
  }
  return {
    agent: agentName,
    passNumber,
    toolCallCount: result.toolCallCount,
    capExhausted: result.capExhausted,
  };
};

/** Run a single validator agent pass, return the parsed diagnostics. */
const runValidator = async (
  opts: OrchestratorOptions,
  agentName: "skill-validator" | "evals-validator",
): Promise<Diagnostics> => {
  const def = getBundledAgent(agentName);
  const ctx: AgentRunContext = {
    skillRoot: opts.skillRoot,
    writeScope: [],
    ...(opts.signal != null ? { signal: opts.signal } : {}),
  };
  tick(opts, `[orchestrator] ${agentName}…`);
  const result = await runAgent(opts.model, def, ctx);
  return parseDiagnostics(result.terminalText);
};

/**
 * Run one writer-validator pair: writer pass → validator pass → if
 * errors, one re-pass with diagnostics threaded in → final
 * validator pass. Returns the run records and final diagnostics.
 */
const runPair = async (
  opts: OrchestratorOptions,
  writerName: "skill-writer" | "eval-writer",
  validatorName: "skill-validator" | "evals-validator",
  initialExtra: string | undefined,
): Promise<{ runs: AgentRunRecord[]; diag: Diagnostics }> => {
  const runs: AgentRunRecord[] = [];
  runs.push(await runWriter(opts, writerName, 1, initialExtra));

  let diag = await runValidator(opts, validatorName);

  const maxRePasses = opts.maxRePassesPerWriter ?? DEFAULT_MAX_REPASSES;
  let pass = 1;
  let prevErrorCount = countErrors(diag);
  while (hasErrors(diag) && pass <= maxRePasses) {
    pass += 1;
    const findingsContext = formatDiagnostics(
      diag,
      `Validator findings from previous pass — address before re-emitting`,
    );
    const extra =
      initialExtra != null && initialExtra !== ""
        ? `${initialExtra}\n\n${findingsContext}`
        : findingsContext;
    runs.push(await runWriter(opts, writerName, pass, extra));
    diag = await runValidator(opts, validatorName);
    const nextErrorCount = countErrors(diag);
    // Stop early when the writer made no progress AND wasn't cap-
    // exhausted — keeps a stuck pair from burning through the full
    // re-pass budget. If the previous writer hit its tool-call cap
    // mid-stream, plateauing findings are expected (the writer
    // wasn't done) and we keep going.
    const lastWriterCapped = runs.at(-1)?.capExhausted === true;
    if (nextErrorCount >= prevErrorCount && nextErrorCount > 0 && !lastWriterCapped) {
      tick(
        opts,
        `[orchestrator] ${writerName}: no progress (errors ${prevErrorCount}→${nextErrorCount}); stopping re-passes`,
      );
      break;
    }
    prevErrorCount = nextErrorCount;
  }
  return { runs, diag };
};

const countErrors = (diag: Diagnostics): number =>
  diag.findings.filter((f) => f.severity === "error").length;

/**
 * Orchestrate one skill-authoring cycle. Assumes spec.yaml exists
 * at `<skillRoot>/spec.yaml` — the orchestrator does NOT run
 * spec-author. Callers (commands) handle spec-establishment
 * before invoking the orchestrator.
 */
export const orchestrate = async (opts: OrchestratorOptions): Promise<OrchestratorResult> => {
  const failingEvalsCtx =
    opts.mode === "improve" && opts.failingEvals != null
      ? formatFailingEvals(opts.failingEvals)
      : "";

  // Sanity check: spec.yaml must exist.
  // (Cheap pre-flight — the writer agents will discover any
  // structural issues themselves.)
  const specPath = join(opts.skillRoot, "spec.yaml");
  if (!existsSync(specPath)) {
    throw new Error(
      `orchestrator: spec.yaml missing at ${specPath}. Run \`skillet create\` (which runs spec-author first) instead of invoking the orchestrator directly.`,
    );
  }

  if (opts.mode === "add-eval") {
    // add-eval: only the evals pair runs. SKILL.md and existing
    // eval files stay untouched (eval-writer's idempotency rule).
    tick(opts, "[orchestrator] add-eval mode: evals pair only");
    const evals = await runPair(opts, "eval-writer", "evals-validator", undefined);
    const skillEmpty: Diagnostics = { ok: true, findings: [] };
    return {
      skillRoot: opts.skillRoot,
      agentsRun: evals.runs,
      diagnostics: { skill: skillEmpty, evals: evals.diag },
      success: !hasErrors(evals.diag),
    };
  }

  // create / improve: run both pairs concurrently.
  const skillExtra = failingEvalsCtx !== "" ? failingEvalsCtx : undefined;
  const [skillPair, evalsPair] = await Promise.all([
    runPair(opts, "skill-writer", "skill-validator", skillExtra),
    runPair(opts, "eval-writer", "evals-validator", undefined),
  ]);

  return {
    skillRoot: opts.skillRoot,
    agentsRun: [...skillPair.runs, ...evalsPair.runs],
    diagnostics: { skill: skillPair.diag, evals: evalsPair.diag },
    success: !hasErrors(skillPair.diag) && !hasErrors(evalsPair.diag),
  };
};
