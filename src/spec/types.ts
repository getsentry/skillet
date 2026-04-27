/**
 * Types for the skill specification (`spec.yaml`).
 *
 * `spec.yaml` is the source of truth for an authored skill. It is
 * managed by skillet (CLI-mediated writes only — never hand-edit) and
 * drives generation of SKILL.md and `evals/*.eval.yaml`. The file
 * carries a banner declaring this contract.
 *
 * Iteration patches the spec, not the derived files: assessment
 * produces `SpecPatch[]` operations that are applied deterministically.
 */

// ── Core spec shape ───────────────────────────────────────

export interface BehaviorEval {
  /**
   * Optional shell setup script that prepares the eval workspace
   * before the agent runs. Same semantics as `workspace.setup` in
   * an eval YAML case (fresh shell, relative paths only).
   */
  setup?: string;
  /**
   * The user turn(s) sent to the agent. A single string is the common
   * case; the array form is reserved for future multi-turn cases.
   */
  prompt: string;
  /**
   * Literal substring that must appear in the agent's output (or in a
   * file the agent is asked to write — eval-gen decides the check
   * shape based on the behavior's deliverable). Mutually exclusive
   * with `criteria`.
   */
  expect?: string;
  /**
   * Natural-language judge criterion. Used when `expect` would be
   * brittle (negative cases, refusal cases, subjective quality).
   * Mutually exclusive with `expect`.
   */
  criteria?: string;
}

export interface Behavior {
  /**
   * Stable kebab-case slug, unique within the combined `behaviors[] +
   * must_not[]` namespace. Auto-generated from `statement` on
   * creation; survives insertion/deletion of other entries.
   */
  id: string;
  /** Imperative one-line rule the skill must enforce. */
  statement: string;
  /** Optional free-text rationale explaining why this rule exists. */
  rationale?: string;
  /**
   * Optional eval block. When absent, eval-gen invents a case from
   * the statement at generate time.
   */
  eval?: BehaviorEval;
}

export interface MustNot {
  /** Stable kebab-case slug, unique within the combined namespace. */
  id: string;
  /** Imperative rule the skill must NOT do. */
  statement: string;
  /** Optional free-text rationale. */
  rationale?: string;
  /**
   * Optional label for the kind of leakage being prevented (e.g.
   * `env-var-leak`, `pii`, `secret`). Hint to eval-gen for shaping
   * the negative check.
   */
  leakage_risk?: string;
  /**
   * Optional eval block. Negative cases SHOULD use `criteria` rather
   * than `expect` because agents commonly echo input tokens.
   */
  eval?: BehaviorEval;
}

export interface Triggers {
  /** Phrases that MUST activate this skill. */
  should: string[];
  /** Near-miss phrases that must NOT activate this skill. */
  should_not: string[];
}

/**
 * Skill class — drives per-class required-coverage dimensions during
 * generation. Optional in the spec; the LLM infers from intent and
 * behaviors when absent.
 */
export type SkillClass =
  | "workflow-process"
  | "integration-documentation"
  | "security-review"
  | "skill-authoring"
  | "generic";

export interface SkillSpec {
  /** Always the literal string `"skillet"` — declares CLI ownership. */
  managed_by: "skillet";
  /** Schema version. v1 is the initial spec format. */
  spec_version: 1;
  /** Skill name. Matches the directory name and SKILL.md frontmatter. */
  name: string;
  /** One-paragraph statement of what the skill does and why. */
  intent: string;
  /** Optional skill class. */
  class?: SkillClass;
  triggers: Triggers;
  behaviors: Behavior[];
  must_not: MustNot[];
}

// ── Patch operations ──────────────────────────────────────

/**
 * Discriminated union of operations the assessment phase or
 * `spec refine` may produce. `applyPatches` fails loudly on unknown
 * ops or operations referencing missing IDs — invalid patches surface
 * as iteration errors rather than silent wrong edits.
 */
export type SpecPatch =
  | { op: "update_intent"; value: string }
  | {
      op: "update_behavior";
      id: string;
      field: "statement" | "rationale";
      value: string;
    }
  | { op: "add_behavior"; behavior: Behavior }
  | { op: "remove_behavior"; id: string }
  | { op: "update_eval"; id: string; eval: BehaviorEval }
  | {
      op: "update_must_not";
      id: string;
      field: "statement" | "rationale" | "leakage_risk";
      value: string;
    }
  | { op: "add_must_not"; must_not: MustNot }
  | { op: "remove_must_not"; id: string }
  | { op: "add_trigger"; kind: "should" | "should_not"; phrase: string }
  | { op: "remove_trigger"; kind: "should" | "should_not"; phrase: string };

/** All recognized op tags. Keep in sync with `SpecPatch` union. */
export const SPEC_PATCH_OPS = [
  "update_intent",
  "update_behavior",
  "add_behavior",
  "remove_behavior",
  "update_eval",
  "update_must_not",
  "add_must_not",
  "remove_must_not",
  "add_trigger",
  "remove_trigger",
] as const satisfies ReadonlyArray<SpecPatch["op"]>;

// ── Validation result (shared with spec/structural.ts) ────

export interface SpecValidationError {
  path: string;
  message: string;
}

export interface SpecValidationResult {
  valid: boolean;
  errors: SpecValidationError[];
}
