import { parseArgs } from "node:util";
import type { StatusJson } from "../json.js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { findConfig } from "../harness/config.js";
import { emitJson, fail, print } from "../output.js";
import { findSkillRoot } from "../skill/frontmatter.js";
import { skillStatus } from "../status.js";
import { noSkillMessage } from "./shared.js";

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
    print(HELP.trimEnd());
    return 0;
  }

  const json = values.json === true;
  const start = resolve(positionals[0] ?? ".");
  if (!existsSync(start)) {
    return fail(`no such path: ${start}`, { json });
  }
  const root = findSkillRoot(start);
  if (root == null) {
    if (findConfig(start) != null) {
      const next = `'skillet new <name>' scaffolds one.`;
      if (json) {
        const payload: StatusJson = { root: null, next };
        emitJson(payload);
        return 0;
      }
      print(`Project initialized (.skillet.yaml found); no skill at or above ${start}.`);
      print(`Next: ${next}`);
      return 0;
    }
    return fail(noSkillMessage(start), { json });
  }
  const status = skillStatus(root);

  if (json) {
    const payload: StatusJson = status;
    emitJson(payload);
    return 0;
  }

  const skillStale = status.skill.present && status.skill.stale;
  print(`Skill: ${status.root}`);
  print(`${mark(status.spec.present)} spec.md`);
  print(
    `${mark(status.skill.present, skillStale)} SKILL.md${skillStale ? " (stale — spec.md is newer)" : ""}`,
  );
  const caseWord = status.evals.caseCount === 1 ? "case" : "cases";
  print(`${mark(status.evals.caseCount > 0)} evals/cases/ (${status.evals.caseCount} ${caseWord})`);
  if (status.legacy.specYaml) {
    print(`    legacy spec.yaml present`);
  }
  print(``);
  print(`Next: ${status.next}`);
  return 0;
};
