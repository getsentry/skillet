import { parseArgs } from "node:util";
import { emitJson, info, print } from "../output.js";
import { type Issue } from "../spec/types.js";
import { validateSkill } from "../validate.js";
import { resolveSkillRoot } from "./shared.js";

const HELP = `Usage: skillet validate [path] [--json]

Structurally validate a skill: spec.md grammar, SKILL.md frontmatter,
eval case schema, and behavior<->eval coverage. Never calls an LLM.
Exit 1 when any error is found.
`;

const printIssues = (label: string, issues: Issue[]): void => {
  if (issues.length === 0) {
    print(`  ${label}: ok`);
    return;
  }
  print(`  ${label}:`);
  for (const issue of issues) {
    const line = issue.line != null ? `:${issue.line}` : "";
    print(`    ${issue.severity === "error" ? "✗" : "⚠"}${line} ${issue.message}`);
    if (issue.hint != null) {
      print(`      fix: ${issue.hint}`);
    }
  }
};

/** `skillet validate` — the full structural report, exit 1 on errors. */
export const run = (argv: string[]): number => {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });
  if (values.help === true) {
    info(HELP);
    return 0;
  }

  const root = resolveSkillRoot(positionals[0]);
  if (root == null) return 1;
  const report = validateSkill(root);

  if (values.json === true) {
    emitJson({
      ok: report.ok,
      spec: report.spec,
      skill: report.skill,
      cases: report.cases,
      coverageIssues: report.coverage,
      behaviorIds: report.parsedSpec?.behaviors.map((b) => b.id) ?? [],
      caseCount: report.evalCases.length,
    });
    return report.ok ? 0 : 1;
  }

  print(`Validation: ${root}`);
  printIssues("spec.md", report.spec);
  printIssues("SKILL.md", report.skill);
  printIssues("eval cases", report.cases);
  printIssues("coverage", report.coverage);
  print(report.ok ? "\nValid." : "\nInvalid — fix the errors above.");
  return report.ok ? 0 : 1;
};
