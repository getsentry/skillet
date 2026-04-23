import { evalCommand } from "./commands/eval.js";
import { validateCommand } from "./commands/validate.js";

const args = process.argv.slice(2);
const command = args[0];

const main = async (): Promise<number> => {
  if (command == null || command === "" || command === "--help" || command === "-h") {
    printUsage();
    return 0;
  }

  switch (command) {
    case "eval": {
      const jsonFlag = args.includes("--json");
      const evalPath = args.find((a, i) => i > 0 && !a.startsWith("--"));
      return evalCommand(evalPath, jsonFlag);
    }

    case "validate": {
      const valJsonFlag = args.includes("--json");
      const valPath = args.find((a, i) => i > 0 && !a.startsWith("--"));
      return validateCommand(valPath, valJsonFlag);
    }

    case "create":
      console.log("create command not yet implemented");
      return 1;

    case "improve":
      console.log("improve command not yet implemented");
      return 1;

    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      return 1;
  }
};

const printUsage = (): void => {
  console.log(`
skillkit — Create, evaluate, and iterate on agent skills

Usage:
  skillkit eval [path] [--json]       Run evals for a skill
  skillkit validate [path] [--json]   Validate SKILL.md and eval files
  skillkit create <description>       Create a new skill (coming soon)
  skillkit improve [path]             Improve an existing skill (coming soon)

Environment:
  ANTHROPIC_API_KEY          Use Anthropic (Claude) as the LLM provider
  OPENAI_API_KEY             Use OpenAI as the LLM provider
  SKILLKIT_MODEL             Override agent model (e.g. anthropic/claude-sonnet-4-20250514)
  SKILLKIT_JUDGE_MODEL       Override judge model separately
`);
};

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Fatal error:", message);
    process.exit(1);
  });
