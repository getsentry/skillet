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
  /**
   * Map of relative workspace path → file content. Skillet writes
   * these files under `evals/fixtures/<case-name>/<rel-path>` at
   * consolidation time and replaces the inline content with a
   * `useFixture(<case-name>)` call in the rendered eval. Preferred
   * over `setup` for new generation.
   */
  fixture?: Record<string, string>;
  /**
   * @deprecated Legacy shell-script seeding the workspace. New
   * generation produces `fixture` instead. Still parsed for
   * backwards compat with hand-authored plans; the renderer falls
   * back to `harness.setup(<script>)` when only `setup` is set.
   */
  setup?: string;
  /** Per-case timeout in milliseconds. */
  timeout?: number;
  /** Ordered list of assertions evaluated inside the test body. */
  assertions: Assertion[];
}

/**
 * Per-case plan after consolidation. Fixture content has been
 * extracted to disk; the case references it by slug
 * (typically the case `name`). Same shape as `CasePlan` minus
 * the inline `fixture`/`setup` content.
 */
export interface ConsolidatedCasePlan {
  name: string;
  tests_behavior: string;
  input: string;
  /** Slug under `evals/fixtures/<slug>/`; rendered as `useFixture(slug)`. */
  fixtureSlug?: string;
  /**
   * @deprecated Falls through to `harness.setup` when a
   * hand-authored plan didn't supply a `fixture` map. Never
   * produced by the consolidation pass for plans that came from
   * eval-gen.
   */
  setup?: string;
  timeout?: number;
  assertions: Assertion[];
}

/**
 * Per-entry plan after consolidation. Judges are not declared
 * here — they live in the suite-wide `_judges.ts`. This shape is
 * what the renderer consumes when emitting a `.eval.ts`.
 */
export interface ConsolidatedPlan {
  cases: ConsolidatedCasePlan[];
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
  | RenameJudgeEdit
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

/**
 * Rename a judge declaration AND every assertion that references
 * it. Used by the verifier to align judges to canonical names so
 * the consolidation pass dedupes them across the suite.
 */
export interface RenameJudgeEdit {
  kind: "rename-judge";
  /** Existing judge name in `plan.judges`. */
  judgeName: string;
  /** New canonical name. Must be PascalCase + Judge suffix. */
  newName: string;
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

// ── Suite-level edits (post-consolidation audit) ───────────────────────────

/**
 * Edits applied to the consolidated suite (not individual plans).
 * Currently only `merge-judges`; the audit may grow more kinds as
 * cross-suite operations show up.
 */
export type SuiteEdit = MergeJudgesEdit;

/**
 * Collapse N near-duplicate canonical judges into one. The merged
 * declarations are dropped from the suite and every assertion that
 * referenced them is rewritten to point at the canonical name. An
 * optional `criterion` overrides the canonical's text — useful when
 * the audit produces a refined rubric that combines wording from
 * the inputs.
 */
export interface MergeJudgesEdit {
  kind: "merge-judges";
  /** The judge that survives the merge (must already be in the suite). */
  canonical: string;
  /** Other judges to merge into the canonical (must all exist in the suite). */
  merged: string[];
  /** Optional refined criterion text for the canonical (≤200 chars). */
  criterion?: string;
}

/** Audit response shape. Same approve / edits pattern as VerifyVerdict. */
export type SuiteVerdict = { approve: true } | { approve: false; edits: SuiteEdit[] };
