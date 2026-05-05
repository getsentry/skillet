import { ADD_EVAL_USAGE, addEvalCommand } from "./commands/add-eval.js";
import { COMPARE_USAGE, compareCommand } from "./commands/compare.js";
import { CREATE_USAGE, createCommand } from "./commands/create.js";
import { EVAL_USAGE, evalCommand } from "./commands/eval.js";
import { IMPROVE_USAGE, improveCommand } from "./commands/improve.js";
import { INSTALL_USAGE, installCommand } from "./commands/install.js";
import { RESUME_USAGE, resumeCommand } from "./commands/resume.js";
import { specCommand } from "./commands/spec.js";
import { VERIFY_USAGE, verifyCommand } from "./commands/verify.js";
import { drainQueue, setQueueConfig } from "./agent/queue.js";
import { installJobSummary, printJobSummary } from "./cli/job-summary.js";
import { setVerbose } from "./log.js";

const args = process.argv.slice(2);
const command = args[0];

const verboseFlag = args.includes("--verbose") || process.env.SKILLET_VERBOSE === "1";
setVerbose(verboseFlag);

// ── Queue config from env + flags ─────────────────────────

const parseIntFlag = (argv: string[], name: string): number | undefined => {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? "";
    if (a === `--${name}`) {
      const next = argv[i + 1];
      const n = next != null ? Number(next) : Number.NaN;
      if (Number.isInteger(n) && n > 0) return n;
    }
    if (a.startsWith(`--${name}=`)) {
      const n = Number(a.slice(`--${name}=`.length));
      if (Number.isInteger(n) && n > 0) return n;
    }
  }
  return undefined;
};

const parseEnvInt = (name: string): number | undefined => {
  const raw = process.env[name];
  if (raw == null) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

const aiConcurrency = parseIntFlag(args, "ai-concurrency") ?? parseEnvInt("SKILLET_AI_CONCURRENCY");
const aiTimeoutMs = parseEnvInt("SKILLET_AI_TIMEOUT");

const queueOverrides: Parameters<typeof setQueueConfig>[0] = {};
if (aiConcurrency != null) queueOverrides.concurrency = aiConcurrency;
if (aiTimeoutMs != null) queueOverrides.timeoutMs = aiTimeoutMs;
if (Object.keys(queueOverrides).length > 0) setQueueConfig(queueOverrides);

installJobSummary();

// ── Command dispatch ──────────────────────────────────────

/**
 * Dispatch table. Each entry pairs a usage string with a handler
 * that takes the per-command argv slice (everything after the
 * command name). `spec` is special-cased — it owns subcommand
 * help routing internally.
 */
type CommandHandler = (subArgs: string[]) => Promise<number> | number;

interface CommandEntry {
  usage: string;
  run: CommandHandler;
}

const COMMANDS: Record<string, CommandEntry> = {
  eval: {
    usage: EVAL_USAGE,
    run: (subArgs) => {
      const jsonFlag = subArgs.includes("--json");
      const positional = subArgs.filter((a) => !a.startsWith("--"));
      return evalCommand(positional[0], jsonFlag);
    },
  },
  compare: {
    usage: COMPARE_USAGE,
    run: (subArgs) => {
      const jsonFlag = subArgs.includes("--json");
      const positional = subArgs.filter((a) => !a.startsWith("--"));
      const [first, second] = positional;
      if (first == null || second == null) {
        console.error(COMPARE_USAGE);
        return Promise.resolve(1);
      }
      return compareCommand(first, second, { json: jsonFlag });
    },
  },
  verify: { usage: VERIFY_USAGE, run: verifyCommand },
  create: { usage: CREATE_USAGE, run: createCommand },
  improve: { usage: IMPROVE_USAGE, run: improveCommand },
  "add-eval": { usage: ADD_EVAL_USAGE, run: addEvalCommand },
  install: { usage: INSTALL_USAGE, run: installCommand },
  resume: { usage: RESUME_USAGE, run: resumeCommand },
};

const main = async (): Promise<number> => {
  if (command == null || command === "" || command === "--help" || command === "-h") {
    printUsage();
    return 0;
  }

  const subArgs = args.slice(1);

  // `spec` owns its own subcommand --help routing.
  if (command === "spec") return specCommand(subArgs);

  const entry = COMMANDS[command];
  if (entry == null) {
    console.error(`Unknown command: ${command}`);
    printUsage();
    return 1;
  }

  const helpRequested = subArgs.includes("--help") || subArgs.includes("-h");
  if (helpRequested) {
    console.log(entry.usage);
    return 0;
  }

  return entry.run(subArgs);
};

const printUsage = (): void => {
  console.log(`
skillet — Create, evaluate, and iterate on agent skills

Usage:
  skillet create <description>                            Create a new skill from a description
  skillet improve [path]                                  Improve an existing skill (auto-imports legacy skills)
  skillet eval [path] [--json]                            Run evals
  skillet compare <a> <b> [--json]                        Run skill A's evals against both A and B; print side-by-side
  skillet verify [path] [--semantic]                      Check spec/SKILL.md/evals agree
  skillet add-eval [path] "behavior"                      Add a behavior to spec.yaml and regenerate
  skillet install [path]                                  Install the skillet skill into your agent
  skillet spec <show|refine|import|init>                  Manage spec.yaml (the source of truth)
  skillet resume <path> --answer "..." [--answer "..."]   Resume a paused spec-author session (non-TTY agents)

Global flags (work on any command):
  --ai-concurrency=N         Max concurrent LLM calls (default 4)
  --verbose                  Verbose logging

Environment:
  Auto-detected (just works when running inside Claude Code, Codex, Copilot, etc.):
    ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / CLAUDE_CODE_OAUTH_TOKEN
    OPENAI_API_KEY / CODEX_API_KEY
    COPILOT_GITHUB_TOKEN / GH_TOKEN / GITHUB_TOKEN
    GEMINI_API_KEY / OPENROUTER_API_KEY / GROQ_API_KEY / and more

  SKILLET_MODEL              Override agent model (e.g. anthropic/claude-opus-4-6)
  SKILLET_JUDGE_MODEL        Override judge model separately
  SKILLET_EVAL_GEN_MODEL     Override the model used for per-behavior eval generation
  SKILLET_AI_CONCURRENCY=N   Max concurrent AI jobs in flight (same as --ai-concurrency, default 4)
  SKILLET_AI_TIMEOUT=ms      Per-job wall-clock deadline (default 600000 = 10 min)
  SKILLET_VERBOSE=1          Enable verbose logging (same as --verbose on any command)
`);
};

main()
  .then(async (code) => {
    await drainQueue();
    printJobSummary();
    process.exit(code);
  })
  .catch(async (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Fatal error:", message);
    await drainQueue();
    printJobSummary();
    process.exit(1);
  });
