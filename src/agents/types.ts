/**
 * Public types for the agent-orchestration layer.
 *
 * Skillet bundles four authoring agents under `agents/`. Each is an
 * Anthropic Agent Skill (SKILL.md + references/) the orchestrator
 * runs through `runToolLoop` to produce SKILL.md, evals, or
 * diagnostics. This module declares the contract the orchestrator
 * and the runner share — no policy, no LLM calls.
 *
 * See openspec/changes/2026-05-04-agent-orchestration/design.md.
 */

/**
 * Tool surface an agent is allowed to use. The runner builds the
 * scoped executor from this policy: writers see the full tool list,
 * validators see only the read tools, no agent ever gets `bash`.
 */
export interface AgentToolPolicy {
  /** Whether the agent may write/edit files. False for validators. */
  canWrite: boolean;
}

/**
 * Static definition of a bundled agent. Resolved once at skillet
 * package load time; consumed by the runner per-invocation.
 */
export interface AgentDefinition {
  /**
   * Stable name. Matches the directory under `agents/` and the
   * `name:` field of the agent's bundled SKILL.md.
   */
  name: string;
  /** Absolute path to the agent's bundle root (`<pkg>/agents/<name>`). */
  bundleRoot: string;
  /** Tool policy. */
  tools: AgentToolPolicy;
  /** Per-turn cap on tool invocations. Default: 40. */
  maxToolCalls?: number;
}

/**
 * Per-invocation context the orchestrator hands to the runner.
 * Defines what the agent reads, what it may write, and any
 * extra free-form context appended to its system prompt.
 */
export interface AgentRunContext {
  /** Absolute path to the user's skill root (the workspace). */
  skillRoot: string;
  /**
   * Absolute paths the agent may read under, beyond `skillRoot` and
   * its own bundle. Empty by default; spec-author-style use cases
   * could populate this with `--input` paths.
   */
  readScope?: string[];
  /**
   * Absolute paths the agent may write under. MUST be a subset of
   * `skillRoot`. Empty array = read-only (validator).
   */
  writeScope: string[];
  /**
   * Extra free-form context appended after the system prompt's
   * Operating Context footer. Used to thread validator findings or
   * failing-eval transcripts into a re-pass.
   */
  extraContext?: string;
  /** Outer abort signal (e.g. orchestrator-level deadline). */
  signal?: AbortSignal;
}

/**
 * Outcome of a single agent run.
 */
export interface AgentRunResult {
  /** The agent's terminal (non-tool-use) text from the final turn. */
  terminalText: string;
  /** How many tool calls the agent issued. */
  toolCallCount: number;
}

// ── Diagnostic schema (validators only) ───────────────────

export type FindingSeverity = "error" | "warning" | "info";

export interface Finding {
  severity: FindingSeverity;
  /**
   * What the finding is about. Free-form but conventional shapes:
   * `behavior:<id>`, `must_not:<id>`, `skill`, `evals`,
   * `reference:<path>`, `eval:<id>`, `judge:<name>`.
   */
  subject: string;
  /**
   * Coarse classification — used for routing and aggregation.
   * Open-ended: validators can introduce new kinds without code
   * changes here.
   */
  kind: string;
  /** One-line summary. */
  message: string;
  /** Optional concrete fix recommendation. */
  suggestion?: string;
}

export interface Diagnostics {
  ok: boolean;
  findings: Finding[];
}

/**
 * Whether a diagnostic set has any error-level finding. Warnings
 * and info do not trigger writer re-passes.
 */
export const hasErrors = (diag: Diagnostics): boolean => {
  return diag.findings.some((f) => f.severity === "error");
};
