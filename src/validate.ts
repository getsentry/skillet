import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkCoverage } from "./coverage.js";
import { listFixtures, loadCases } from "./evals/case.js";
import type { EvalCase } from "./evals/case.js";
import { parseFrontmatter } from "./skill/frontmatter.js";
import { parseSpec } from "./spec/parser.js";
import type { ParsedSpec, SpecIssue } from "./spec/types.js";

export interface ValidationReport {
  ok: boolean;
  spec: SpecIssue[];
  skill: SpecIssue[];
  cases: SpecIssue[];
  coverage: SpecIssue[];
  parsedSpec: ParsedSpec | null;
  evalCases: EvalCase[];
}

/** SKILL.md frontmatter rules (validation spec). */
export const validateSkillMd = (root: string): SpecIssue[] => {
  const path = join(root, "SKILL.md");
  if (!existsSync(path)) {
    return [
      {
        severity: "warning",
        message: "SKILL.md not present yet",
        hint: "Render it from spec.md ('skillet instructions skill').",
      },
    ];
  }
  const issues: SpecIssue[] = [];
  const raw = readFileSync(path, "utf-8");
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
  return issues;
};

/**
 * The full-skill report behind `skillet validate` (validation spec):
 * spec grammar, SKILL.md frontmatter, case schema, and coverage. No
 * LLM calls anywhere.
 */
export const validateSkill = (root: string): ValidationReport => {
  const specPath = join(root, "spec.md");
  const specIssues: SpecIssue[] = [];
  let parsedSpec: ParsedSpec | null = null;

  if (existsSync(specPath)) {
    const parsed = parseSpec(readFileSync(specPath, "utf-8"));
    specIssues.push(...parsed.issues);
    parsedSpec = parsed.spec;
  } else {
    specIssues.push({
      severity: "error",
      message: "spec.md not found",
      hint: "Every skill needs a spec — 'skillet new' scaffolds one, /skillet:migrate imports legacy skills.",
    });
  }

  const skillIssues = validateSkillMd(root);
  const { cases, issues: caseIssues } = loadCases(root);
  const coverageIssues =
    parsedSpec != null
      ? checkCoverage(
          parsedSpec,
          cases.map((c) => ({
            file: c.file,
            behavior: c.behavior,
            ...(c.fixture != null && { fixture: c.fixture }),
          })),
          listFixtures(root),
        )
      : [];

  const all = [...specIssues, ...skillIssues, ...caseIssues, ...coverageIssues];
  return {
    ok: !all.some((i) => i.severity === "error"),
    spec: specIssues,
    skill: skillIssues,
    cases: caseIssues,
    coverage: coverageIssues,
    parsedSpec,
    evalCases: cases,
  };
};
