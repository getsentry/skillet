import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { emitJson, fail, info } from "../output.js";
import { CONFIG_FILE } from "../harness/config.js";
import { SUPPORTED_TOOLS, generateTool } from "../integration/generators.js";
import type { ToolId } from "../integration/generators.js";
import { VERSION } from "../version.js";

const HELP = `Usage: skillet init [path] [--tools <ids|all|none>] [--force] [--json]

Scaffold skillet in a project: a commented .skillet.yaml (if missing)
and the /skillet:* workflow files for your agents.

  --tools    Comma-separated: ${SUPPORTED_TOOLS.join(", ")} (default: claude).
             'all' generates every integration, 'none' skips them.
             Note: codex prompts are written to $CODEX_HOME/prompts (global).
  --force    Overwrite previously generated workflow files (after upgrades).
`;

const CONFIG_TEMPLATE = `# skillet configuration — see 'skillet eval --help'
# harness: codex        # codex (default) | claude | custom mapping:
# harness:
#   name: my-agent
#   command: "my-agent run --dir {workspace} {prompt}"
#   skill_dir: "{workspace}/.my-agent/skills"
#
# Containerize harness runs (for untrusted skills / CI):
# sandbox:
#   enabled: true        # or opt in per run: skillet eval --sandbox docker
#   image: skillet-eval  # build recipe: sandbox/Dockerfile in the skillet repo
#   network: true
`;

/** `skillet init` — scaffold .skillet.yaml and per-tool workflow files. */
export const run = async (argv: string[]): Promise<number> => {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      tools: { type: "string" },
      force: { type: "boolean" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });
  if (values.help === true) {
    info(HELP);
    return 0;
  }

  const projectRoot = resolve(positionals[0] ?? ".");
  if (!existsSync(projectRoot)) {
    return fail(`no such directory: ${projectRoot}`);
  }

  const toolsArg = values.tools ?? "claude";
  let tools: ToolId[];
  if (toolsArg === "none") {
    tools = [];
  } else if (toolsArg === "all") {
    tools = [...SUPPORTED_TOOLS];
  } else {
    const requested = toolsArg.split(",").map((t) => t.trim());
    const unknown = requested.filter((t) => !(SUPPORTED_TOOLS as readonly string[]).includes(t));
    if (unknown.length > 0) {
      return fail(
        `unknown tools: ${unknown.join(", ")} (supported: ${SUPPORTED_TOOLS.join(", ")})`,
      );
    }
    tools = requested.filter((t): t is ToolId =>
      (SUPPORTED_TOOLS as readonly string[]).includes(t),
    );
  }

  const configPath = join(projectRoot, CONFIG_FILE);
  const configCreated = !existsSync(configPath);
  if (configCreated) {
    writeFileSync(configPath, CONFIG_TEMPLATE);
  }

  const generated = tools.flatMap((tool) =>
    generateTool(tool, projectRoot, VERSION, values.force === true).map((file) => ({
      tool,
      ...file,
    })),
  );

  if (values.json === true) {
    emitJson({ root: projectRoot, configCreated, configPath, files: generated });
    return 0;
  }

  if (configCreated) {
    info(`Created ${configPath}`);
  }
  for (const file of generated) {
    info(`${file.skipped ? "kept   " : "wrote  "} ${file.path}`);
  }
  info(`\nWorkflows: /skillet:propose -> /skillet:render -> skillet eval -> /skillet:improve`);
  info(`Start a skill with 'skillet new <name>'.`);
  return 0;
};
