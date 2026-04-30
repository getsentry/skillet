/**
 * Types for the skill specification (`spec.yaml`).
 *
 * `spec.yaml` is the source of truth for an authored skill. It is
 * managed by skillet (CLI-mediated writes only — never hand-edit) and
 * drives generation of SKILL.md and `evals/*.eval.ts`. The file
 * carries a banner declaring this contract.
 *
 * The spec captures intent (what the skill does), not eval
 * implementation (how it's tested). Eval files are generated from
 * the spec but live independently — once generated and committed,
 * they are the durable test artifact, not a derived view of the spec.
 *
 * Iteration patches the spec, not the derived files: assessment
 * produces `SpecPatch[]` operations that are applied deterministically.
 */

// ── Core spec shape ───────────────────────────────────────

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
}

export interface Triggers {
  /** Phrases that MUST activate this skill. */
  should: string[];
  /** Near-miss phrases that must NOT activate this skill. */
  should_not: string[];
}

export interface ReferenceDoc {
  /**
   * Relative path under the skill root. Must be one-level-deep under
   * `references/`, e.g. `references/django.md`.
   */
  path: string;
  /** Human-readable title for the reference file. */
  title: string;
  /** Condition for when SKILL.md should tell the agent to read it. */
  load_when: string;
  /** Why this reference exists and what gap it fills. */
  purpose: string;
  /** Focused topics the generated reference should cover. */
  topics: string[];
}

export interface SkillSpec {
  /** Always the literal string `"skillet"` — declares CLI ownership. */
  managed_by: "skillet";
  /** Schema version. v1 is the initial spec format. */
  spec_version: 1;
  /** Skill name. Matches the directory name and SKILL.md frontmatter. */
  name: string;
  /** One-paragraph statement of what the skill does and why. */
  intent: string;
  triggers: Triggers;
  behaviors: Behavior[];
  must_not: MustNot[];
  /**
   * Optional reference artifacts for domain-expert skills. These are
   * generated when missing and then preserved so authors can tune
   * them by hand, mirroring eval file durability.
   */
  references?: ReferenceDoc[];
  /**
   * Arbitrary frontmatter keys that aren't part of skillet's typed
   * schema (e.g. `allowed-tools`, `argument-hint`, `model`). spec-import
   * captures them from the source SKILL.md; skill-gen renders them
   * back into the regenerated frontmatter on every regen, so unknown
   * keys round-trip safely. Values are passed through unchanged.
   */
  frontmatter_extras?: Record<string, unknown>;
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
  | {
      op: "update_must_not";
      id: string;
      field: "statement" | "rationale" | "leakage_risk";
      value: string;
    }
  | { op: "add_must_not"; must_not: MustNot }
  | { op: "remove_must_not"; id: string }
  | { op: "add_reference"; reference: ReferenceDoc }
  | {
      op: "update_reference";
      path: string;
      field: "title" | "load_when" | "purpose" | "topics";
      value: string | string[];
    }
  | { op: "remove_reference"; path: string }
  | { op: "add_trigger"; kind: "should" | "should_not"; phrase: string }
  | { op: "remove_trigger"; kind: "should" | "should_not"; phrase: string };

/** All recognized op tags. Keep in sync with `SpecPatch` union. */
export const SPEC_PATCH_OPS = [
  "update_intent",
  "update_behavior",
  "add_behavior",
  "remove_behavior",
  "update_must_not",
  "add_must_not",
  "remove_must_not",
  "add_reference",
  "update_reference",
  "remove_reference",
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
