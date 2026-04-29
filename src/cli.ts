import { evalCommand } from "./commands/eval.js";
import { verifyCommand } from "./commands/verify.js";
import { createCommand } from "./commands/create.js";
import { improveCommand } from "./commands/improve.js";
import { installCommand } from "./commands/install.js";
import { addEvalCommand } from "./commands/add-eval.js";
import { compareCommand } from "./commands/compare.js";
import { specCommand } from "./commands/spec.js";
import { setVerbose } from "./log.js";

const args = process.argv.slice(2);
const command = args[0];

// Activate verbose logging early so all command-level work flows
// through the structured logger. Both `--verbose` (any position) and
// `SKILLET_VERBOSE=1` toggle it; commands don't need to plumb the
// flag themselves.
const verboseFlag = args.includes("--verbose") || process.env.SKILLET_VERBOSE === "1";
setVerbose(verboseFlag);

const main = async (): Promise<number> => {
  if (command == null || command === "" || command === "--help" || command === "-h") {
    printUsage();
    return 0;
  }

  switch (command) {
    case "eval": {
      const jsonFlag = args.includes("--json");
      const positional = args.filter((a, i) => i > 0 && !a.startsWith("--"));
      const evalPath = positional[0];
      const concurrencyArg = parseConcurrency(args);
      return evalCommand(evalPath, jsonFlag, concurrencyArg);
    }

    case "compare": {
      const jsonFlag = args.includes("--json");
      const positional = args.filter((a, i) => i > 0 && !a.startsWith("--"));
      const [first, second] = positional;
      if (first == null || second == null) {
        console.error(
          "Usage: skillet compare <eval-source-skill> <comparison-skill> [--json] [--concurrency N]",
        );
        return 1;
      }
      const opts: { json?: boolean; concurrency?: number } = { json: jsonFlag };
      const c = parseConcurrency(args);
      if (c != null) opts.concurrency = c;
      return compareCommand(first, second, opts);
    }

    case "verify":
      return verifyCommand(args.slice(1));

    case "create":
      return createCommand(args.slice(1));

    case "improve":
      return improveCommand(args.slice(1));

    case "add-eval":
      return addEvalCommand(args.slice(1));

    case "install":
      return installCommand(args.slice(1));

    case "spec":
      return specCommand(args.slice(1));

    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      return 1;
  }
};

/**
 * Parse `--concurrency N` (or `--concurrency=N`) from argv. Returns
 * undefined when the flag is absent or the value isn't a positive
 * integer — caller falls back to the runner's default (8).
 */
const parseConcurrency = (argv: string[]): number | undefined => {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg == null) continue;
    if (arg === "--concurrency") {
      const next = argv[i + 1];
      const n = next != null ? Number(next) : NaN;
      return Number.isInteger(n) && n > 0 ? n : undefined;
    }
    if (arg.startsWith("--concurrency=")) {
      const n = Number(arg.slice("--concurrency=".length));
      return Number.isInteger(n) && n > 0 ? n : undefined;
    }
  }
  return undefined;
};

const printUsage = (): void => {
  console.log(`
skillet — Create, evaluate, and iterate on agent skills

Usage:
  skillet create <description>                            Create a new skill from a description
  skillet improve [path]                                  Improve an existing skill (auto-imports legacy skills)
  skillet eval [path] [--json] [--concurrency N]          Run evals (default 8 in parallel)
  skillet compare <a> <b> [--json] [--concurrency N]      Run skill A's evals against both A and B; print side-by-side
  skillet verify [path] [--semantic]                      Check spec/SKILL.md/evals agree (subsumes the old validate)
  skillet add-eval [path] "behavior"                      Add a behavior to spec.yaml and regenerate
  skillet install [path]                                  Install the skillet skill into your agent
  skillet spec <show|refine|import|init>                  Manage spec.yaml (the source of truth)

Environment:
  Auto-detected (just works when running inside Claude Code, Codex, Copilot, etc.):
    ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / CLAUDE_CODE_OAUTH_TOKEN
    OPENAI_API_KEY / CODEX_API_KEY
    COPILOT_GITHUB_TOKEN / GH_TOKEN / GITHUB_TOKEN
    GEMINI_API_KEY / OPENROUTER_API_KEY / GROQ_API_KEY / and more

  SKILLET_MODEL              Override agent model (e.g. anthropic/claude-sonnet-4-20250514)
  SKILLET_JUDGE_MODEL        Override judge model separately
  SKILLET_EVAL_GEN_MODEL     Override the model used for per-behavior eval generation
  SKILLET_VERBOSE=1          Enable verbose logging (same as --verbose on any command)
`);
};

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Fatal error:", message);
    process.exit(1);
  });
