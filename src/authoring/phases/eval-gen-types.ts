/**
 * Assertion-plan types consumed by the eval-gen renderer.
 *
 * Eval-gen's LLM call returns a JSON `AssertionPlan`. Skillet
 * validates the plan and renders the `.eval.ts` file deterministically
 * via `renderEvalFile` — the LLM never produces TypeScript directly.
 *
 * The plan separates judge declarations (one per behavior, named for
 * the behavior) from cases. Each case is a list of typed assertions:
 * deterministic ones map to `expect(...)`, the `judge` kind references
 * a declared judge by name and renders to
 * `await expect(result).toSatisfyJudge(JudgeName)`.
 */

import type { JsonValue } from "../../eval/types.js";

/** Top-level shape returned by the LLM eval-gen call. */
export interface AssertionPlan {
  /** Zero or more named LLM-judges declared at file scope. */
  judges: JudgePlan[];
  /** One or more case plans for the spec entry under generation. */
  cases: CasePlan[];
}

export interface JudgePlan {
  /** PascalCase identifier ending in `Judge`, e.g. `PwnRequestJudge`. */
  name: string;
  /** Plain-text rubric body. Rendered as the `criterion(...)` argument. */
  criterion: string;
}

export interface CasePlan {
  /** Test name, format `<entry-id>__<short-slug>`. */
  name: string;
  /** Spec entry id this case covers; must match the requested entry. */
  tests_behavior: string;
  /** User prompt fed to the agent. */
  input: string;
  /** Optional shell setup script run before the agent (workspace seed). */
  setup?: string;
  /** Per-case timeout in milliseconds. */
  timeout?: number;
  /** Ordered list of assertions evaluated inside the test body. */
  assertions: Assertion[];
}

/**
 * Assertion kinds available to eval-gen plans. Three first-class
 * shapes:
 *
 * - `output-match-object` — structural equality on `result.output`
 *   when the skill emits a structured finding block.
 * - `tool-calls` — structural assertions on the tool-call sequence.
 * - `judge` — named LLM-rubric judge invoked via `toSatisfyJudge`.
 *
 * Regex/substring matching against the agent's free-form chat
 * (`result.session.outputText`) is **banned**: those checks are
 * brittle (the agent paraphrases between runs) and they test the
 * assertion's grammar more than the agent's behavior. If a
 * property needs to be checked, either the skill emits structured
 * output (use `output-match-object`) or the property is judged by
 * a named LLM rubric (use `judge`).
 */
export type Assertion = OutputMatchObjectAssertion | ToolCallsAssertion | JudgeAssertion;

/** Structural equality against `result.output` via `toMatchObject`. */
export interface OutputMatchObjectAssertion {
  kind: "output-match-object";
  value: JsonValue;
}

/** Tool-call expectations evaluated against `toolCalls(result.session)`. */
export interface ToolCallsAssertion {
  kind: "tool-calls";
  expected: ToolCallExpectation;
}

export type ToolCallExpectation =
  /** Exact ordered list of tool call names. */
  | { type: "names-equal"; names: string[] }
  /** Names that must appear (in any order). */
  | { type: "names-include"; names: string[] }
  /** Names that must NOT appear. */
  | { type: "names-exclude"; names: string[] };

/** LLM-judged check; references a judge declared in `plan.judges`. */
export interface JudgeAssertion {
  kind: "judge";
  /** Must match a `name` in `plan.judges`. */
  judgeName: string;
}

// ── Plan edits (verify-pass output) ────────────────────────────────────────

/**
 * A single revision to an `AssertionPlan` produced by the verify
 * pass. Edits are applied in input order by `applyPlanEdits`.
 */
export type PlanEdit =
  | DropJudgeEdit
  | ReplaceJudgeWithDeterministicEdit
  | SplitJudgeEdit
  | AddJudgeEdit
  | ShortenCriterionEdit
  | AddDeterministicEdit
  | DropAssertionEdit;

/** Remove a judge declaration AND every assertion that references it. */
export interface DropJudgeEdit {
  kind: "drop-judge";
  judgeName: string;
}

/**
 * Remove a judge declaration AND, in every case that referenced it,
 * splice the supplied deterministic assertions in place of the
 * judge assertion.
 */
export interface ReplaceJudgeWithDeterministicEdit {
  kind: "replace-judge-with-deterministic";
  judgeName: string;
  replacements: Assertion[];
}

/**
 * Replace a single judge declaration with N narrower judges, and
 * rewrite each case that referenced the original to reference the
 * named replacements in `caseAssignments` order.
 */
export interface SplitJudgeEdit {
  kind: "split-judge";
  judgeName: string;
  /** New judges to declare in place of the original. */
  replacements: JudgePlan[];
  /**
   * Subset of replacement judge names that each referencing case
   * receives. The cases that referenced the original judge get one
   * `judge` assertion per name in this list, in order.
   */
  caseAssignments: string[];
}

/**
 * Declare a new judge AND wire it into named cases by appending a
 * `judge` assertion to each one's assertion list.
 */
export interface AddJudgeEdit {
  kind: "add-judge";
  judge: JudgePlan;
  caseNames: string[];
}

/** Shorten a judge's `criterion` text in place. */
export interface ShortenCriterionEdit {
  kind: "shorten-criterion";
  judgeName: string;
  criterion: string;
}

/** Append a deterministic assertion to a case's assertion list. */
export interface AddDeterministicEdit {
  kind: "add-deterministic";
  caseName: string;
  assertion: Assertion;
}

/** Drop a single assertion from a case (by 0-based index). */
export interface DropAssertionEdit {
  kind: "drop-assertion";
  caseName: string;
  assertionIndex: number;
}

/** Verifier response shape. */
export type VerifyVerdict = { approve: true } | { approve: false; edits: PlanEdit[] };
