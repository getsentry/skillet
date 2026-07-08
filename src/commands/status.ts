import { parseArgs } from "node:util";
import { emitJson, info, print } from "../output.js";
import { skillStatus } from "../status.js";
import { resolveSkillRoot } from "./shared.js";

const HELP = `Usage: skillet status [path] [--json]

Show which artifacts exist for a skill (spec.md, SKILL.md, eval cases),
what is stale, and the single next step. State comes purely from disk.
`;

const mark = (present: boolean, stale?: boolean): string => {
  if (!present) return "[ ]";
  return stale === true ? "[~]" : "[x]";
};

/** `skillet status` — artifact state and next step, derived from disk. */
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
  const status = skillStatus(root);

  if (values.json === true) {
    emitJson(status);
    return 0;
  }

  print(`Skill: ${status.root}`);
  print(`${mark(status.spec.present)} spec.md`);
  print(
    `${mark(status.skill.present, status.skill.stale)} SKILL.md${status.skill.stale === true ? " (stale — spec.md is newer)" : ""}`,
  );
  print(`${mark(status.evals.present)} evals/cases/ (${status.evals.caseCount} cases)`);
  if (status.legacy.specYaml) {
    print(`    legacy spec.yaml present`);
  }
  print(``);
  print(`Next: ${status.next}`);
  return 0;
};
