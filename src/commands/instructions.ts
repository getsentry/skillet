import { parseArgs } from "node:util";
import { instructionsFor, type ArtifactId } from "../instructions/content.js";
import type { InstructionsJson } from "../json.js";
import { emitJson, fail, print } from "../output.js";
import { skillStatus } from "../status.js";
import { resolveSkillRoot } from "./shared.js";

const HELP = `Usage: skillet instructions <spec|skill|evals> [path] [--json]\n       (the artifact and path may be given in either order)

Serve the template, writing instructions, and output path for one
artifact, plus the skill's current state. This is the machine
interface agent workflows consume — the generated /skillet:* commands
call it instead of embedding guidance.
`;

const ARTIFACTS: ArtifactId[] = ["spec", "skill", "evals"];

/** `skillet instructions` — serve one artifact's template and rules. */
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

  // Artifact and path are accepted in either order — every other
  // command takes [path] first, so don't punish that habit here.
  const artifact = ARTIFACTS.find((a) => positionals.includes(a));
  if (artifact == null) {
    return fail(`instructions needs an artifact: ${ARTIFACTS.join(", ")}`);
  }
  const pathArg = positionals.find((p) => p !== artifact);

  const payload = instructionsFor(artifact);
  // Instructions are useful before the skill directory exists (the
  // propose workflow calls this from the repo root), so state is
  // optional context, not a requirement.
  let state = null;
  if (pathArg != null) {
    const root = resolveSkillRoot(pathArg);
    if (root == null) return 1;
    state = skillStatus(root);
  }

  if (values.json === true) {
    const wire: InstructionsJson = { ...payload, state };
    emitJson(wire);
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
