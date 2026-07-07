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

type CommandModule = { run: (argv: string[]) => Promise<number> };

const COMMANDS: Record<string, () => Promise<CommandModule>> = {
  new: () => import("./commands/new.js"),
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

  const loader = COMMANDS[command];
  if (loader == null) {
    return fail(`Unknown command '${command}'.\n\n${HELP}`);
  }

  const mod = await loader();
  return mod.run(rest);
};

process.exitCode = await main();
