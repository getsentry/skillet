import type { Context, Message } from "@mariozechner/pi-ai";
import type { AnyModel } from "../../agent/provider.js";
import { wrapExecutorForScope, type ResearchScope } from "../../agent/scope.js";
import { runToolLoop } from "../../agent/tool-loop.js";
import { createReadOnlyToolDefs, executeTool } from "../../agent/tools.js";
import { PausedForAnswers } from "../../cli/transport.js";
import {
  applyPatches,
  renderSpec,
  validateClassGates,
  validateSpecObject,
  validateSpecPatch,
  type SkillSpec,
  type SpecPatch,
} from "../../spec/index.js";
import { buildSpecAuthorPrompt } from "../prompts/spec-author.js";
import { isRecord, stripFences } from "./_text.js";

/**
 * Raised when the spec-author loop reaches a question in non-TTY
 * mode. Carries the spec + messages so the calling command can
 * persist a session and resume later. `pauseKind` distinguishes a
 * mid-loop user-clarification pause (`"questions"`) from the final
 * commit-confirmation pause (`"accept"`) so resume can interpret the
 * answer correctly.
 */
export class SpecAuthorPaused extends Error {
  questions: string[];
  spec: SkillSpec;
  messages: Message[];
  pauseKind: "questions" | "accept";
  constructor(
    questions: string[],
    spec: SkillSpec,
    messages: Message[],
    pauseKind: "questions" | "accept",
  ) {
    super(`Spec-author paused awaiting ${questions.length} user answer(s).`);
    this.name = "SpecAuthorPaused";
    this.questions = questions;
    this.spec = spec;
    this.messages = messages;
    this.pauseKind = pauseKind;
  }
}

// ── Interactive transport ─────────────────────────────────

/**
 * Question/answer transport injected into the loop. Decoupled from
 * the phase so the loop can be exercised in tests with a scripted
 * transport, and so non-TTY callers (CI) can refuse questions
 * without the phase needing to know about stdin.
 */
export interface InteractiveTransport {
  /** Render the proposed spec + summary so the user can read it. */
  presentTurn: (turn: TurnPresentation) => void;
  /**
   * Ask the user one or more open questions. Resolve with answers in
   * the same order. The non-TTY transport rejects with
   * `PausedForAnswers([...questions])` so the calling command can
   * persist a session and surface the full batch to the user.
   */
  askQuestions: (questions: string[]) => Promise<string[]>;
  /**
   * Final accept prompt after gates pass. Resolves with the user's
   * decision: accept the spec or keep iterating.
   */
  askAccept: (spec: SkillSpec) => Promise<"accept" | "iterate">;
}

export interface TurnPresentation {
  iteration: number;
  spec: SkillSpec;
  patchCount: number;
  gateOk: boolean;
  missingDimensions: string[];
  missingReferenceTopics: string[];
  /** One-line summary of tools the agent called this turn. */
  toolSummary?: string;
}

// ── Turn output ───────────────────────────────────────────

interface TurnOutput {
  patches: SpecPatch[];
  questions: string[];
  commitRequest: boolean;
}

const parseTurnOutput = (raw: string): TurnOutput => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`spec-author turn: invalid JSON — ${msg}`, { cause: err });
  }
  if (!isRecord(parsed)) {
    throw new Error("spec-author turn: top-level value must be an object");
  }
  const rawPatches = parsed.patches;
  if (!Array.isArray(rawPatches)) {
    throw new Error("spec-author turn: 'patches' must be an array (use [] when nothing changes)");
  }
  const patches = rawPatches.map((p, i) => validateSpecPatch(p, i));
  const rawQuestions = parsed.questions;
  let questions: string[];
  if (rawQuestions == null) {
    questions = [];
  } else if (!Array.isArray(rawQuestions)) {
    throw new Error("spec-author turn: 'questions' must be an array of strings (or omitted)");
  } else {
    questions = rawQuestions.filter((q): q is string => typeof q === "string" && q.trim() !== "");
  }
  const commitRequest = parsed.commit_request === true;
  return { patches, questions, commitRequest };
};

// ── Loop ──────────────────────────────────────────────────

const DEFAULT_MAX_TURNS = 6;
const DEFAULT_MAX_TOOL_CALLS_PER_TURN = 30;
/** Per-turn wall-clock budget for one LLM↔tool exchange. */
const PER_TURN_DEADLINE_MS = 10 * 60_000;
/** Hard ceiling across all turns in a single invocation. Resume
 *  resets this clock; persistent counting is out of scope. */
const SESSION_DEADLINE_MS = 30 * 60_000;

export interface SpecAuthorOptions {
  model: AnyModel;
  /** Baseline spec from one of the seed strategies. */
  baseline: SkillSpec;
  /**
   * Research scope the agent's read-only tools may operate in. Built
   * by `buildAuthoringScope` from bundled references + skill root +
   * --input paths (or CWD fallback). `scope.defaultBase` is the base
   * for relative tool path arguments.
   */
  scope: ResearchScope;
  /**
   * Optional human-readable context surfaced to the LLM on turn 1
   * (e.g. eval failure digest from improve seed).
   */
  initialContext?: string;
  transport: InteractiveTransport;
  /** Max LLM author-turns before the loop bails. Defaults to 6. */
  maxTurns?: number;
  /** Per-turn cap on tool invocations. Defaults to 30. */
  maxToolCallsPerTurn?: number;
  /**
   * Resume payload from a persisted session. When provided, the loop
   * starts from `messages` instead of building a fresh history, and
   * any `pendingAnswers` are pre-fed as a user turn before the next
   * LLM call. Used by `skillet resume` after a non-TTY pause.
   */
  resume?: {
    messages: Message[];
    /**
     * Question→answer pairs to pre-feed. Length must match the number
     * of questions raised at the pause point; the resume command
     * verifies this before calling.
     */
    pendingAnswers: { question: string; answer: string }[];
    /**
     * What the loop was awaiting at pause time. `accept` means the
     * answer is a yes/no commit decision and should NOT be fed back
     * to the LLM. `questions` is the regular pre-feed path.
     */
    pauseKind: "questions" | "accept";
  };
}

export interface SpecAuthorResult {
  spec: SkillSpec;
  turns: number;
  accepted: boolean;
}

/**
 * Run the agentic spec-author loop. Each turn the LLM may call
 * read-only filesystem tools (read_file, list_files, grep) inside
 * the research scope before emitting a structured turn output
 * `{ patches, questions, commit_request }`. The loop terminates when
 * the user accepts a gate-passing spec, or when the transport
 * refuses to answer a question (non-TTY mode → SpecAuthorPaused).
 */
export const runSpecAuthor = async (opts: SpecAuthorOptions): Promise<SpecAuthorResult> => {
  const maxTurns = opts.maxTurns ?? DEFAULT_MAX_TURNS;
  const maxToolCallsPerTurn = opts.maxToolCallsPerTurn ?? DEFAULT_MAX_TOOL_CALLS_PER_TURN;
  let current = opts.baseline;
  const messages: Message[] = opts.resume != null ? [...opts.resume.messages] : [];

  if (opts.resume != null) {
    // Accept-mode resume: the answer is a yes/no commit decision, not
    // conversation. Short-circuit to avoid re-prompting the LLM.
    if (opts.resume.pauseKind === "accept") {
      const answer = opts.resume.pendingAnswers[0]?.answer ?? "";
      const normalized = answer.trim().toLowerCase();
      if (normalized === "yes" || normalized === "y" || normalized === "accept") {
        return { spec: current, turns: 0, accepted: true };
      }
      // Treat anything else as "decline; keep refining" — push as a
      // synthetic user message so the next LLM turn sees the rejection
      // and can propose more changes.
      messages.push({
        role: "user",
        content: `User declined to commit (answer: ${answer || "(empty)"}). Continue refining or ask what they want changed.`,
        timestamp: Date.now(),
      });
    } else if (opts.resume.pendingAnswers.length > 0) {
      const pairs = opts.resume.pendingAnswers.map((p) => `Q: ${p.question}\nA: ${p.answer}`);
      messages.push({
        role: "user",
        content: `User answers:\n\n${pairs.join("\n\n")}`,
        timestamp: Date.now(),
      });
    }
  } else if (opts.initialContext != null && opts.initialContext.trim() !== "") {
    messages.push({
      role: "user",
      content: `## Initial context\n\n${opts.initialContext.trim()}`,
      timestamp: Date.now(),
    });
  }

  // Build the scoped tool executor once per session — the scope is
  // fixed at session start (resume preserves it).
  const tools = createReadOnlyToolDefs();
  const scopedExecutor = wrapExecutorForScope(
    (name, args) => executeTool(opts.scope.defaultBase, name, args),
    opts.scope,
  );
  const sessionDeadline = Date.now() + SESSION_DEADLINE_MS;
  const turnDeadline = (): number => Math.min(sessionDeadline, Date.now() + PER_TURN_DEADLINE_MS);

  for (let iteration = 1; iteration <= maxTurns; iteration++) {
    const gates = validateClassGates(current);
    const turnUserMessage = buildTurnUserMessage(current, gates, opts.scope);
    messages.push({ role: "user", content: turnUserMessage, timestamp: Date.now() });

    const context: Context = {
      systemPrompt: buildSpecAuthorPrompt(),
      messages,
      tools,
    };

    const toolCounts = new Map<string, number>();
    const turnLoop = await runToolLoop({
      model: opts.model,
      context,
      executeTool: scopedExecutor,
      deadline: turnDeadline(),
      maxToolCalls: maxToolCallsPerTurn,
      onToolCall: (name) => {
        toolCounts.set(name, (toolCounts.get(name) ?? 0) + 1);
      },
    });

    let terminalText = turnLoop.finalText;

    if (turnLoop.endReason === "max-tool-calls") {
      // Nudge the model toward terminal output with no more tool calls.
      messages.push({
        role: "user",
        content:
          "Tool budget reached for this turn. Emit your final patches/questions/commit_request now without further tool calls.",
        timestamp: Date.now(),
      });
      const nudge = await runToolLoop({
        model: opts.model,
        context,
        executeTool: scopedExecutor,
        deadline: turnDeadline(),
        maxToolCalls: 0,
      });
      if (nudge.endReason === "max-tool-calls") {
        throw new Error(
          "spec-author: agent kept requesting tool calls after budget exhaustion notice",
        );
      }
      terminalText = nudge.finalText;
    } else if (turnLoop.endReason === "error") {
      throw new Error(`spec-author: LLM returned error: ${turnLoop.errorMessage ?? "unknown"}`);
    }

    let turn: TurnOutput;
    try {
      turn = parseTurnOutput(stripFences(terminalText, "json"));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      messages.push({
        role: "user",
        content: `Your terminal output failed to parse:\n${msg}\n\nRe-emit ONLY the JSON object with patches/questions/commit_request.`,
        timestamp: Date.now(),
      });
      continue;
    }

    if (turn.patches.length > 0) {
      const candidate = applyPatches(current, turn.patches);
      const validation = validateSpecObject(candidate, "spec-author candidate");
      if (!validation.valid) {
        const summary = validation.errors.map((e) => `- ${e.message}`).join("\n");
        messages.push({
          role: "user",
          content: `Your patches produced an invalid spec:\n${summary}\n\nFix the offending patches and re-emit your turn output.`,
          timestamp: Date.now(),
        });
        continue;
      }
      current = candidate;
    }

    const postPatchGates = validateClassGates(current);
    const presentation: TurnPresentation = {
      iteration,
      spec: current,
      patchCount: turn.patches.length,
      gateOk: postPatchGates.valid,
      missingDimensions: postPatchGates.missingDimensions,
      missingReferenceTopics: postPatchGates.missingReferenceTopics,
    };
    const summary = formatToolSummary(toolCounts);
    if (summary != null) presentation.toolSummary = summary;
    opts.transport.presentTurn(presentation);

    // Ask any LLM-raised questions first; user answers feed into next
    // turn so the LLM can respond to them. The transport receives the
    // full batch so non-TTY mode can pause once instead of N times.
    if (turn.questions.length > 0) {
      let answers: string[];
      try {
        answers = await opts.transport.askQuestions(turn.questions);
      } catch (err: unknown) {
        if (err instanceof PausedForAnswers) {
          throw new SpecAuthorPaused(err.questions, current, messages, "questions");
        }
        throw err;
      }
      const pairs = turn.questions.map((q, i) => `Q: ${q}\nA: ${answers[i] ?? "(no answer)"}`);
      messages.push({
        role: "user",
        content: `User answers:\n\n${pairs.join("\n\n")}`,
        timestamp: Date.now(),
      });
      continue;
    }

    // If gates fail, we can't accept yet. Loop back so the LLM proposes
    // more patches against the same spec.
    if (!postPatchGates.valid) {
      messages.push({
        role: "user",
        content: `Class gates still fail: missing dimensions ${formatList(postPatchGates.missingDimensions)}, missing reference topics ${formatList(postPatchGates.missingReferenceTopics)}. Propose patches to close these gaps.`,
        timestamp: Date.now(),
      });
      continue;
    }

    // Gates pass. If the LLM thinks we're done, prompt the user.
    if (turn.commitRequest) {
      let decision: "accept" | "iterate";
      try {
        decision = await opts.transport.askAccept(current);
      } catch (err: unknown) {
        if (err instanceof PausedForAnswers) {
          throw new SpecAuthorPaused(err.questions, current, messages, "accept");
        }
        throw err;
      }
      if (decision === "accept") {
        return { spec: current, turns: iteration, accepted: true };
      }
      messages.push({
        role: "user",
        content: "User declined to commit yet. Continue refining.",
        timestamp: Date.now(),
      });
      continue;
    }

    // Gates pass but LLM hasn't asked to commit; nudge it.
    messages.push({
      role: "user",
      content:
        "Class gates currently pass. If the spec is ready, set `commit_request: true` and emit empty patches/questions so the user can accept it. Otherwise propose remaining refinements.",
      timestamp: Date.now(),
    });
  }

  return { spec: current, turns: maxTurns, accepted: false };
};

// ── Helpers ───────────────────────────────────────────────

const buildTurnUserMessage = (
  spec: SkillSpec,
  gates: ReturnType<typeof validateClassGates>,
  scope: ResearchScope,
): string => {
  const yaml = renderSpec(spec);
  const gateLines = gates.valid
    ? "All class gates currently pass."
    : `Class gates failing:\n- missing dimensions: ${formatList(gates.missingDimensions)}\n- missing reference topics: ${formatList(gates.missingReferenceTopics)}`;
  const scopeLines = [
    `Default base for relative paths: ${scope.defaultBase}`,
    `Research scope (allowed read roots):`,
    ...scope.roots.map((r) => `- ${r}`),
  ].join("\n");
  return `## Current spec.yaml\n\n${yaml}\n\n## Gate status\n\n${gateLines}\n\n## Research scope\n\n${scopeLines}`;
};

const formatList = (items: string[]): string => {
  return items.length === 0 ? "(none)" : items.join(", ");
};

const formatToolSummary = (counts: Map<string, number>): string | undefined => {
  if (counts.size === 0) return undefined;
  const parts: string[] = [];
  for (const [name, n] of counts) parts.push(`${n}× ${name}`);
  return `tools: ${parts.join(", ")}`;
};
