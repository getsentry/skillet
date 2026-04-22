import { evalCommand } from "./commands/eval.js";

const args = process.argv.slice(2);
const command = args[0];

async function main(): Promise<number> {
  if (!command || command === "--help" || command === "-h") {
    printUsage();
    return 0;
  }

  switch (command) {
    case "eval":
      return evalCommand(args[1]);

    case "create":
      console.log("create command not yet implemented");
      return 1;

    case "iterate":
      console.log("iterate command not yet implemented");
      return 1;

    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      return 1;
  }
}

function printUsage(): void {
  console.log(`
skillkit — Create, evaluate, and iterate on agent skills

Usage:
  skillkit eval [path]       Run evals for a skill
  skillkit create [path]     Create a new skill (coming soon)
  skillkit iterate [path]    Improve a skill from eval failures (coming soon)

Environment:
  ANTHROPIC_API_KEY          Use Anthropic (Claude) as the LLM provider
  OPENAI_API_KEY             Use OpenAI as the LLM provider
  SKILLKIT_MODEL             Override agent model (e.g. anthropic/claude-sonnet-4-20250514)
  SKILLKIT_JUDGE_MODEL       Override judge model separately
`);
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("Fatal error:", err.message);
    process.exit(1);
  });
