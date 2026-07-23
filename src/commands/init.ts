import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { CURRENT_SKILLET } from "../invocation.js";
import type { InitJson } from "../json.js";
import { emitJson, fail, info, print } from "../output.js";

const SKILL = "skillet-authoring";
const SOURCE = "getsentry/skillet";

const HELP = `Usage: skillet init [--no-prompt] [--json]

Install the ${SKILL} skill for your agents via @sentry/dotagents in
user scope (~/.agents), so asking any agent to create or improve a
skill lands on skillet. Asks before touching anything; --no-prompt
skips the confirmation (for agents and scripts).

Prefer to manage it yourself? Add the skill with dotagents directly
(project scope: 'npx -y @sentry/dotagents@latest add ${SOURCE} ${SKILL}'), or
install skills/${SKILL} from the skillet repo by any other means.
`;

const SELF_MANAGED = `To manage it yourself instead:
  npx -y @sentry/dotagents@latest add ${SOURCE} ${SKILL}
  (project scope; add --user for global) — or install skills/${SKILL}
  from the skillet repo by any other means.`;

/** Cheap presence probe — dotagents owns the file, we only detect. */
const alreadyInstalled = (): boolean => {
  const toml = join(homedir(), ".agents", "agents.toml");
  return existsSync(toml) && readFileSync(toml, "utf8").includes(SKILL);
};

const payload = (status: InitJson["status"]): InitJson => ({
  status,
  skill: SKILL,
  source: SOURCE,
  scope: "user",
});

/** `skillet init` — set up the authoring skill via dotagents (user scope). */
export const run = async (argv: string[]): Promise<number> => {
  const { values } = parseArgs({
    args: argv,
    options: {
      "no-prompt": { type: "boolean" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help === true) {
    print(HELP.trimEnd());
    return 0;
  }
  const json = values.json === true;

  if (alreadyInstalled()) {
    if (json) {
      emitJson(payload("already-installed"));
    } else {
      info(`${SKILL} is already installed in ~/.agents — nothing to do.`);
    }
    return 0;
  }

  let consented = values["no-prompt"] === true;
  if (!consented) {
    if (json || !process.stdin.isTTY) {
      // Non-interactive without explicit consent: explain and do nothing.
      info(`skillet init installs ${SKILL} for all your agents via`);
      info(`'npx -y @sentry/dotagents@latest --user' (writes ~/.agents and agent configs).`);
      info(`Re-run with --no-prompt to proceed non-interactively.`);
      info(SELF_MANAGED);
      if (json) emitJson(payload("skipped"));
      return 0;
    }
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    const answer = await rl.question(
      `Install ${SKILL} for all your agents via @sentry/dotagents (user scope, ~/.agents)? [Y/n] `,
    );
    rl.close();
    consented = ["", "y", "yes"].includes(answer.trim().toLowerCase());
    if (!consented) {
      info(SELF_MANAGED);
      return 0;
    }
  }

  try {
    execFileSync("npx", ["-y", "@sentry/dotagents@latest", "--user", "add", SOURCE, SKILL], {
      stdio: ["ignore", 2, 2],
      timeout: 300_000,
    });
  } catch {
    return fail(
      `dotagents setup failed — run it directly to see why: npx -y @sentry/dotagents@latest --user add ${SOURCE} ${SKILL}`,
      { json },
    );
  }

  if (json) {
    emitJson(payload("installed"));
  } else {
    info(`${SKILL} installed for all your agents (user scope, ~/.agents).`);
    info(
      `Try it: ask your agent to create a skill. '${CURRENT_SKILLET} new <name>' scaffolds one by hand.`,
    );
  }
  return 0;
};
