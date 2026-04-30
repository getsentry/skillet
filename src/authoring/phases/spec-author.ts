import type { Context, Message } from "@mariozechner/pi-ai";
import { completeWithBackoff } from "../../agent/complete-with-backoff.js";
import type { AnyModel } from "../../agent/provider.js";
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
import { extractText, isRecord, stripFences } from "./_text.js";

/**
 * Raised when the spec-author loop reaches a question in non-TTY
 * mode. Carries the spec + messages so the calling command can
 * persist a session and resume later. The CLI command catches this
 * and writes `<skillRoot>/.skillet-session.json`.
 */
export class SpecAuthorPaused extends Error {
  questions: string[];
  spec: SkillSpec;
  messages: Message[];
  constructor(questions: string[], spec: SkillSpec, messages: Message[]) {
    super(`Spec-author paused awaiting ${questions.length} user answer(s).`);
    this.name = "SpecAuthorPaused";
    this.questions = questions;
    this.spec = spec;
    this.messages = messages;
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

export interface SpecAuthorOptions {
  model: AnyModel;
  /** Baseline spec from one of the seed strategies. */
  baseline: SkillSpec;
  /**
   * Optional human-readable context surfaced to the LLM on turn 1
   * (e.g. eval failure digest from improve seed).
   */
  initialContext?: string;
  transport: InteractiveTransport;
  /** Max LLM turns before the loop bails. Defaults to 6. */
  maxTurns?: number;
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
  };
}

export interface SpecAuthorResult {
  spec: SkillSpec;
  turns: number;
  accepted: boolean;
}

/**
 * Run the interactive spec-author loop. Each turn the LLM proposes
 * patches, optionally asks the user questions, and signals whether
 * the spec is ready to commit. The loop terminates when the user
 * explicitly accepts a gate-passing spec, or when the transport
 * refuses to answer a question (non-TTY mode).
 */
export const runSpecAuthor = async (opts: SpecAuthorOptions): Promise<SpecAuthorResult> => {
  const maxTurns = opts.maxTurns ?? DEFAULT_MAX_TURNS;
  let current = opts.baseline;
  const messages: Message[] = opts.resume != null ? [...opts.resume.messages] : [];

  if (opts.resume != null) {
    if (opts.resume.pendingAnswers.length > 0) {
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

  for (let iteration = 1; iteration <= maxTurns; iteration++) {
    const gates = validateClassGates(current);
    const turnUserMessage = buildTurnUserMessage(current, gates);
    messages.push({ role: "user", content: turnUserMessage, timestamp: Date.now() });

    const context: Context = {
      systemPrompt: buildSpecAuthorPrompt(),
      messages,
    };
    const response = await completeWithBackoff(opts.model, context);
    if (response.stopReason === "error") {
      const errMsg = response.errorMessage ?? "unknown error";
      throw new Error(`spec-author: LLM returned error: ${errMsg}`);
    }
    messages.push(response);

    const raw = stripFences(extractText(response), "json");
    const turn = parseTurnOutput(raw);

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
    opts.transport.presentTurn({
      iteration,
      spec: current,
      patchCount: turn.patches.length,
      gateOk: postPatchGates.valid,
      missingDimensions: postPatchGates.missingDimensions,
      missingReferenceTopics: postPatchGates.missingReferenceTopics,
    });

    // Ask any LLM-raised questions first; user answers feed into next
    // turn so the LLM can respond to them. The transport receives the
    // full batch so non-TTY mode can pause once instead of N times.
    if (turn.questions.length > 0) {
      let answers: string[];
      try {
        answers = await opts.transport.askQuestions(turn.questions);
      } catch (err: unknown) {
        if (err instanceof PausedForAnswers) {
          throw new SpecAuthorPaused(err.questions, current, messages);
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
          throw new SpecAuthorPaused(err.questions, current, messages);
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
): string => {
  const yaml = renderSpec(spec);
  const gateLines = gates.valid
    ? "All class gates currently pass."
    : `Class gates failing:\n- missing dimensions: ${formatList(gates.missingDimensions)}\n- missing reference topics: ${formatList(gates.missingReferenceTopics)}`;
  return `## Current spec.yaml\n\n${yaml}\n\n## Gate status\n\n${gateLines}`;
};

const formatList = (items: string[]): string => {
  return items.length === 0 ? "(none)" : items.join(", ");
};
