/**
 * Skill class definitions: required dimensions and required reference
 * topics per class. The author loop refuses to finalize a spec whose
 * declared `class` requires dimensions or reference topics that are
 * not present.
 *
 * Names mirror getsentry/skills' `skill-writer` so generated skills
 * can pull skill-writer references verbatim. Required dimensions per
 * class follow that skill's `mode-selection.md` table.
 */

import { SKILL_CLASSES, type SkillClass } from "./types.js";

export interface ClassDefinition {
  /** Human-readable description used in prompts. */
  description: string;
  /**
   * Coverage dimensions a spec of this class MUST address. Each
   * dimension must appear in at least one behavior's `dimensions[]`
   * for the spec to pass class gates. Empty array = no dimension
   * gating (workflow-process and generic).
   */
  requiredDimensions: string[];
  /**
   * Reference `topics[]` values that must appear on at least one
   * `references[]` entry. Empty array = no reference gating.
   */
  requiredReferenceTopics: string[];
}

export const CLASSES: Record<SkillClass, ClassDefinition> = {
  "workflow-process": {
    description:
      "Repeatable operations, CI/task orchestration, runbook-style work with ordered steps.",
    requiredDimensions: ["preconditions", "ordered-flow", "failure-handling", "safety-boundaries"],
    requiredReferenceTopics: [],
  },
  "integration-documentation": {
    description:
      "Library/framework integration, SDK usage, API correctness — surface, options, gotchas.",
    requiredDimensions: ["api-surface", "common-use-cases", "known-issues", "version-variance"],
    requiredReferenceTopics: ["api-surface", "use-cases", "troubleshooting"],
  },
  "security-review": {
    description: "Vulnerability finding and exploitability review across one or more stacks.",
    requiredDimensions: [
      "vulnerability-classes",
      "exploit-paths",
      "false-positive-controls",
      "severity-calibration",
      "remediations",
    ],
    requiredReferenceTopics: ["vulnerability-patterns", "false-positive-traps", "remediations"],
  },
  "skill-authoring": {
    description: "Creating, updating, or evaluating other agent skills.",
    requiredDimensions: [
      "source-provenance",
      "depth-gates",
      "transformed-examples",
      "registration-validation",
    ],
    requiredReferenceTopics: ["example:happy-path", "example:anti-pattern"],
  },
  generic: {
    description:
      "Does not match the named classes. Author loop must justify dimensions explicitly.",
    requiredDimensions: [],
    requiredReferenceTopics: [],
  },
};

/**
 * Render the class table as Markdown for inclusion in prompts. Kept
 * here (not in the prompt module) so adding a class touches one file.
 */
export const renderClassTable = (): string => {
  const lines = [
    "| Skill class | Required behavior dimensions | Required reference topics |",
    "|-------------|-----------------------------|---------------------------|",
  ];
  for (const name of SKILL_CLASSES) {
    const def = CLASSES[name];
    const dims = def.requiredDimensions.length > 0 ? def.requiredDimensions.join(", ") : "—";
    const topics =
      def.requiredReferenceTopics.length > 0 ? def.requiredReferenceTopics.join(", ") : "—";
    lines.push(`| \`${name}\` | ${dims} | ${topics} |`);
  }
  return lines.join("\n");
};
