import { parseArgs } from "node:util";
import { instructionsFor } from "../instructions/content.js";
import type { ArtifactId } from "../instructions/content.js";
import { emitJson, fail, info, print } from "../output.js";
import { skillStatus } from "../status.js";
import { resolveSkillRoot } from "./shared.js";

const HELP = `Usage: skillet instructions <spec|skill|evals> [path] [--json]

Serve the template, writing instructions, and output path for one
artifact, plus the skill's current state. This is the machine
interface agent workflows consume — the generated /skillet:* commands
call it instead of embedding guidance.
`;

const ARTIFACTS: ArtifactId[] = ["spec", "skill", "evals"];

/** `skillet instructions` — serve one artifact's template and rules. */
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

  const artifact = ARTIFACTS.find((a) => a === positionals[0]);
  if (artifact == null) {
    return fail(`instructions needs an artifact: ${ARTIFACTS.join(", ")}`);
  }

  const payload = instructionsFor(artifact);
  // Instructions are useful before the skill directory exists (the
  // propose workflow calls this from the repo root), so state is
  // optional context, not a requirement.
  let state = null;
  if (positionals[1] != null) {
    const root = resolveSkillRoot(positionals[1]);
    if (root == null) return 1;
    state = skillStatus(root);
  }

  if (values.json === true) {
    emitJson({ ...payload, state });
    return 0;
  }

  print(`# instructions: ${payload.artifact} -> ${payload.outputPath}`);
  print(``);
  print(payload.instructions);
  print(``);
  print(`## Template`);
  print(``);
  print(payload.template);
  return 0;
};
