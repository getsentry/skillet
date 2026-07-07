import { parseArgs } from "node:util";
import { emitJson, fail, info, print } from "../output.js";
import { validateSkill } from "../validate.js";
import { resolveSkillRoot } from "./shared.js";

const HELP = `Usage: skillet show [path] [--json]

Pretty-print a skill's parsed spec with its eval coverage.
`;

/** `skillet show` — human-readable view of the parsed spec and coverage. */
export const run = async (argv: string[]): Promise<number> => {
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
  const spec = report.parsedSpec;
  if (spec == null) {
    return fail("spec.md is missing or unparseable — run 'skillet validate' for details");
  }

  const coveredBy = new Map<string, string[]>();
  for (const c of report.evalCases) {
    const bucket = coveredBy.get(c.behavior) ?? [];
    bucket.push(c.id);
    coveredBy.set(c.behavior, bucket);
  }

  if (values.json === true) {
    emitJson({
      root,
      spec,
      coverage: spec.behaviors.map((b) => ({
        behavior: b.id,
        cases: coveredBy.get(b.id) ?? [],
      })),
    });
    return 0;
  }

  print(`# ${spec.name}`);
  print(``);
  print(spec.intent);
  print(``);
  print(`Triggers:`);
  for (const t of spec.triggers.should) print(`  SHOULD     ${t}`);
  for (const t of spec.triggers.shouldNot) print(`  SHOULD NOT ${t}`);
  print(``);
  print(`Behaviors (${spec.behaviors.length}):`);
  for (const b of spec.behaviors) {
    const cases = coveredBy.get(b.id) ?? [];
    const coverage = cases.length > 0 ? `covered by ${cases.join(", ")}` : "no eval case";
    print(`  ${b.id} — ${b.scenarios.length} scenario(s), ${coverage}`);
  }
  if (spec.constraints.length > 0) {
    print(``);
    print(`Constraints (${spec.constraints.length}):`);
    for (const c of spec.constraints) print(`  ${c.id}`);
  }
  return 0;
};
