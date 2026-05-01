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

export type Assertion =
  | OutputMatchesAssertion
  | OutputContainsAssertion
  | OutputNotContainsAssertion
  | OutputMatchObjectAssertion
  | ToolCallsAssertion
  | JudgeAssertion;

/** Regex match against `result.session.outputText`. */
export interface OutputMatchesAssertion {
  kind: "output-matches";
  pattern: string;
  flags?: string;
}

/** Substring presence in `result.session.outputText`. */
export interface OutputContainsAssertion {
  kind: "output-contains";
  value: string;
}

/** Substring absence in `result.session.outputText`. */
export interface OutputNotContainsAssertion {
  kind: "output-not-contains";
  value: string;
}

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
