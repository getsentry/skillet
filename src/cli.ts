import { evalCommand } from "./commands/eval.js";
import { validateCommand } from "./commands/validate.js";
import { createCommand } from "./commands/create.js";
import { improveCommand } from "./commands/improve.js";
import { installCommand } from "./commands/install.js";

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
      return createCommand(args.slice(1));

    case "improve":
      return improveCommand(args.slice(1));

    case "install":
      return installCommand(args.slice(1));

    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      return 1;
  }
};

const printUsage = (): void => {
  console.log(`
skillet — Create, evaluate, and iterate on agent skills

Usage:
  skillet create <description>       Create a new skill from a description
  skillet improve [path]             Improve an existing skill
  skillet eval [path] [--json]       Run evals for a skill
  skillet validate [path] [--json]   Validate SKILL.md and eval files
  skillet install [path]             Install the skillet skill into your agent

Environment:
  Auto-detected (just works when running inside Claude Code, Codex, Copilot, etc.):
    ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / CLAUDE_CODE_OAUTH_TOKEN
    OPENAI_API_KEY / CODEX_API_KEY
    COPILOT_GITHUB_TOKEN / GH_TOKEN / GITHUB_TOKEN
    GEMINI_API_KEY / OPENROUTER_API_KEY / GROQ_API_KEY / and more

  SKILLET_MODEL              Override agent model (e.g. anthropic/claude-sonnet-4-20250514)
  SKILLET_JUDGE_MODEL        Override judge model separately
`);
};

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Fatal error:", message);
    process.exit(1);
  });
