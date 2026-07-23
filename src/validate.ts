import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkCoverage } from "./coverage.js";
import { listFixtures, loadCases, type EvalCase } from "./evals/case.js";
import { hasExactFile } from "./files.js";
import { parseFrontmatter } from "./skill/frontmatter.js";
import { parseSpec } from "./spec/parser.js";
import type { ParsedSpec, Issue } from "./spec/types.js";

export interface ValidationReport {
  ok: boolean;
  spec: Issue[];
  skill: Issue[];
  cases: Issue[];
  coverage: Issue[];
  coverageChecked: boolean;
  parsedSpec: ParsedSpec | null;
  evalCases: EvalCase[];
}

/** SKILL.md frontmatter rules (validation spec). */
const validateSkillMd = (root: string): Issue[] => {
  const path = join(root, "SKILL.md");
  if (!hasExactFile(root, "SKILL.md")) {
    return [
      {
        severity: "warning",
        message: "SKILL.md not present yet",
        hint: "Render it from spec.md ('skillet instructions skill').",
      },
    ];
  }
  const issues: Issue[] = [];
  const raw = readFileSync(path, "utf8");
  const { meta } = parseFrontmatter(raw);
  if (Object.keys(meta).length === 0) {
    issues.push({
      severity: "error",
      message: "SKILL.md has no YAML frontmatter",
      hint: "Start the file with --- name/description --- frontmatter.",
    });
    return issues;
  }
  for (const field of ["name", "description"]) {
    const value = meta[field];
    if (typeof value !== "string" || value.trim() === "") {
      issues.push({
        severity: "error",
        message: `SKILL.md frontmatter is missing "${field}"`,
        hint: `Add a non-empty ${field} to the frontmatter.`,
      });
    }
  }
  if (hasExactFile(root, "spec.md") && typeof meta["spec_hash"] !== "string") {
    issues.push({
      severity: "warning",
      message: "SKILL.md frontmatter has no spec_hash",
      hint: "Record 'skillet status --json' .spec.hash so staleness detection survives git clones.",
    });
  }
  return issues;
};

/**
 * The full-skill report behind `skillet validate` (validation spec):
 * spec grammar, SKILL.md frontmatter, case schema, and coverage. No
 * LLM calls anywhere.
 */
export const validateSkill = (root: string): ValidationReport => {
  const specPath = join(root, "spec.md");
  const specIssues: Issue[] = [];
  let parsedSpec: ParsedSpec | null = null;

  if (hasExactFile(root, "spec.md")) {
    const parsed = parseSpec(readFileSync(specPath, "utf8"));
    specIssues.push(...parsed.issues);
    parsedSpec = parsed.spec;
  } else {
    const legacySpec = hasExactFile(root, "SPEC.md");
    specIssues.push({
      severity: "error",
      message: legacySpec
        ? "spec.md not found; uppercase SPEC.md is a legacy document, not a Skillet spec"
        : "spec.md not found",
      hint: legacySpec
        ? "Preserve or rename SPEC.md, then derive lowercase spec.md from SKILL.md and the legacy document ('skillet instructions spec' has the format)."
        : "Every skill needs a spec — 'skillet new' scaffolds one; existing skills get one via 'skillet instructions spec'.",
    });
  }

  const skillIssues = validateSkillMd(root);
  const { cases, issues: caseIssues } = loadCases(root);
  const coverageChecked =
    parsedSpec != null && !specIssues.some((issue) => issue.severity === "error");
  const coverageIssues =
    coverageChecked && parsedSpec != null
      ? checkCoverage(parsedSpec, cases, listFixtures(root))
      : [];

  const all = [...specIssues, ...skillIssues, ...caseIssues, ...coverageIssues];
  return {
    ok: !all.some((i) => i.severity === "error"),
    spec: specIssues,
    skill: skillIssues,
    cases: caseIssues,
    coverage: coverageIssues,
    coverageChecked,
    parsedSpec,
    evalCases: cases,
  };
};
