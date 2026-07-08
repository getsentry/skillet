import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, resolve, join } from "node:path";
import { parseArgs } from "node:util";
import type { NewJson } from "../json.js";
import { emitJson, fail, info, print } from "../output.js";
import { slugify } from "../spec/slug.js";
import { specTemplate } from "../spec/template.js";

const HELP = `Usage: skillet new <name> [--path <dir>] [--json]

Scaffold a skill directory with a templated spec.md and evals/ layout.
The directory is named by the slugified skill name unless --path is given.
`;

const titleCase = (slug: string): string => {
  return slug
    .split("-")
    .map((w) => (w === "" ? w : w[0]?.toUpperCase() + w.slice(1)))
    .join(" ");
};

/** `skillet new` — scaffold a skill directory around a fresh spec.md. */
export const run = (argv: string[]): number => {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      path: { type: "string" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });
  if (values.help === true) {
    print(HELP.trimEnd());
    return 0;
  }
  if (positionals.length === 0) {
    info(HELP);
    return 1;
  }

  const name = positionals.join(" ");
  const slug = slugify(name);
  if (slug === "") {
    return fail(`"${name}" does not produce a usable directory name`);
  }
  const dir = resolve(values.path ?? slug);
  if (existsSync(join(dir, "spec.md"))) {
    return fail(`${join(dir, "spec.md")} already exists`);
  }

  mkdirSync(join(dir, "evals", "cases"), { recursive: true });
  mkdirSync(join(dir, "evals", "fixtures"), { recursive: true });
  const displayName = name === slug ? titleCase(slug) : name;
  writeFileSync(join(dir, "spec.md"), specTemplate(displayName));

  if (values.json === true) {
    const payload: NewJson = {
      root: dir,
      name: displayName,
      created: ["spec.md", "evals/cases/", "evals/fixtures/"],
    };
    emitJson(payload);
    return 0;
  }

  info(`Created skill scaffold at ${dir}/`);
  info(`  spec.md            — fill in intent, triggers, behaviors (or run /skillet:propose)`);
  info(`  evals/cases/       — one YAML case per behavior`);
  info(`  evals/fixtures/    — starting workspaces for cases`);
  info(`Next: edit ${basename(dir)}/spec.md, then 'skillet status' shows what to produce next.`);
  return 0;
};
