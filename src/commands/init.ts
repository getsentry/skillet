import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { fail, info } from "../output.js";
import { CONFIG_FILE } from "../harness/config.js";
import { SUPPORTED_TOOLS, generateTool } from "../integration/generators.js";
import type { ToolId } from "../integration/generators.js";
import { VERSION } from "../version.js";

const HELP = `Usage: skillet init [path] [--tools <ids|all|none>] [--force]

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
`;

export const run = async (argv: string[]): Promise<number> => {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      tools: { type: "string" },
      force: { type: "boolean" },
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
  if (!existsSync(configPath)) {
    writeFileSync(configPath, CONFIG_TEMPLATE);
    info(`Created ${configPath}`);
  }

  for (const tool of tools) {
    const files = generateTool(tool, projectRoot, VERSION, values.force === true);
    for (const file of files) {
      info(`${file.skipped ? "kept   " : "wrote  "} ${file.path}`);
    }
  }

  info(`\nWorkflows: /skillet:propose -> /skillet:render -> skillet eval -> /skillet:improve`);
  info(`Start a skill with 'skillet new <name>'.`);
  return 0;
};
