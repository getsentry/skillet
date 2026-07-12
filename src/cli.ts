/**
 * CLI entry point: a lazy dispatch table and nothing else. Commands
 * own their flags and output; exit codes are 0 success / 1 failure
 * (cli spec, "JSON output convention"). No LLM work happens anywhere
 * in this process.
 */
import { fail, info, print } from "./output.js";

const HELP = `skillet — spec-driven agent skills with mechanical evals

Usage: skillet <command> [args]

Commands:
  init          Install the skillet-authoring skill for your agents
  new <name>    Scaffold a skill directory with a spec.md template
  status        Show artifact state for a skill
  instructions  Serve artifact templates and writing instructions
  validate      Structurally validate a skill (no LLM)
  eval          Run eval cases through the configured harness
  show          Pretty-print a skill's spec and coverage

Run 'skillet <command> --help' for command-specific flags.
Exit codes: 0 success, 1 failure. --json prints one JSON object on stdout.
`;

/** v0 commands and where their job moved (cli spec, "Removed command"). */
const REMOVED_COMMANDS: Record<string, string> = {
  create:
    "authoring is agent-driven now — ask your agent (the skillet-authoring skill drives it), or 'skillet new <name>' to scaffold by hand",
  improve:
    "ask your agent to fix failing evals; 'skillet eval --json' carries the failure transcripts",
  spec: "spec.md is edited directly — 'skillet instructions spec' has the format, 'skillet validate' checks it",
  "add-eval": "add a YAML case under evals/cases/ ('skillet instructions evals' has the template)",
  resume: "there are no sessions to resume; workflow state lives on disk ('skillet status')",
  compare: "use 'skillet eval --baseline' to compare with and without the skill",
  install: "'skillet init' sets up the authoring skill for your agents via @sentry/dotagents",
};

interface CommandModule {
  run: (argv: string[]) => number | Promise<number>;
}

const COMMANDS: Record<string, () => Promise<CommandModule>> = {
  init: () => import("./commands/init.js"),
  new: () => import("./commands/new.js"),
  instructions: () => import("./commands/instructions.js"),
  status: () => import("./commands/status.js"),
  validate: () => import("./commands/validate.js"),
  eval: () => import("./commands/eval.js"),
  show: () => import("./commands/show.js"),
};

/** Node's parseArgs throws typed errors on unknown/misused flags. */
const isUsageError = (cause: unknown): cause is Error => {
  return (
    cause instanceof Error &&
    "code" in cause &&
    typeof cause.code === "string" &&
    cause.code.startsWith("ERR_PARSE_ARGS")
  );
};

const main = async (): Promise<number> => {
  const [command, ...rest] = process.argv.slice(2);
  // Dispatcher-level failures happen before any command parses flags,
  // so honor the JSON contract by sniffing argv directly.
  const json = rest.includes("--json");

  if (command == null) {
    info(HELP);
    return 1;
  }
  if (command === "--help" || command === "-h" || command === "help") {
    print(HELP.trimEnd());
    return 0;
  }
  if (command === "--version" || command === "-v" || command === "version") {
    const { VERSION } = await import("./version.js");
    print(VERSION);
    return 0;
  }

  const removed = REMOVED_COMMANDS[command];
  if (removed != null) {
    return fail(`'skillet ${command}' was removed in v1 — ${removed}`, { json });
  }

  const loader = COMMANDS[command];
  if (loader == null) {
    return fail(`Unknown command '${command}'.\n\n${HELP}`, { json });
  }

  const mod = await loader();
  try {
    return await mod.run(rest);
  } catch (cause) {
    if (isUsageError(cause)) {
      return fail(`${cause.message}\nRun 'skillet ${command} --help' for flags.`, { json });
    }
    throw cause;
  }
};

process.exitCode = await main();
