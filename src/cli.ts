/**
 * CLI entry point: a lazy dispatch table and nothing else. Commands
 * own their flags and output; exit codes are 0 success / 1 failure
 * (cli spec, "JSON output convention"). No LLM work happens anywhere
 * in this process.
 */
import { fail } from "./output.js";

const HELP = `skillet — spec-driven agent skills with mechanical evals

Usage: skillet <command> [args]

Commands:
  init          Scaffold project and agent tool integrations
  new <name>    Scaffold a skill directory with a spec.md template
  status        Show artifact state for a skill
  instructions  Serve artifact templates and writing instructions
  validate      Structurally validate a skill (no LLM)
  eval          Run eval cases through the configured harness
  show          Pretty-print a skill's spec and coverage

Run 'skillet <command> --help' for command-specific flags.
`;

/** v0 commands and where their job moved (cli spec, "Removed command"). */
const REMOVED_COMMANDS: Record<string, string> = {
  create:
    "authoring is agent-driven now — run /skillet:propose in your agent, or 'skillet new <name>' to scaffold by hand",
  improve: "run /skillet:improve in your agent; it reads 'skillet eval --json' failures",
  spec: "spec.md is edited directly — /skillet:propose writes it, 'skillet validate' checks it",
  "add-eval": "add a YAML case under evals/cases/ ('skillet instructions evals' has the template)",
  resume: "there are no sessions to resume; workflow state lives on disk ('skillet status')",
  compare: "use 'skillet eval --baseline' to compare with and without the skill",
  install: "'skillet init --tools <ids>' generates agent integrations",
};

type CommandModule = { run: (argv: string[]) => Promise<number> };

const COMMANDS: Record<string, () => Promise<CommandModule>> = {
  init: () => import("./commands/init.js"),
  new: () => import("./commands/new.js"),
  instructions: () => import("./commands/instructions.js"),
  status: () => import("./commands/status.js"),
  validate: () => import("./commands/validate.js"),
  eval: () => import("./commands/eval.js"),
  show: () => import("./commands/show.js"),
};

const main = async (): Promise<number> => {
  const [command, ...rest] = process.argv.slice(2);

  if (command == null || command === "--help" || command === "-h" || command === "help") {
    process.stderr.write(HELP);
    return command == null ? 1 : 0;
  }

  const removed = REMOVED_COMMANDS[command];
  if (removed != null) {
    return fail(`'skillet ${command}' was removed in v1 — ${removed}`);
  }

  const loader = COMMANDS[command];
  if (loader == null) {
    return fail(`Unknown command '${command}'.\n\n${HELP}`);
  }

  const mod = await loader();
  return mod.run(rest);
};

process.exitCode = await main();
