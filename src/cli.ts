import { addEvalCommand } from "./commands/add-eval.js";
import { compareCommand } from "./commands/compare.js";
import { createCommand } from "./commands/create.js";
import { evalCommand } from "./commands/eval.js";
import { improveCommand } from "./commands/improve.js";
import { installCommand } from "./commands/install.js";
import { resumeCommand } from "./commands/resume.js";
import { specCommand } from "./commands/spec.js";
import { verifyCommand } from "./commands/verify.js";
import { drainQueue, onJobEvent, setQueueConfig, type JobEvent } from "./agent/queue.js";
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
      const n = next != null ? Number(next) : NaN;
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
const aiRetries = parseEnvInt("SKILLET_AI_RETRIES");
const aiTimeoutMs = parseEnvInt("SKILLET_AI_TIMEOUT");
// Deprecated: --concurrency on eval/compare. Still routes to the
// AI queue but emits a deprecation note.
const deprecatedConcurrency = parseIntFlag(args, "concurrency");

const queueOverrides: Parameters<typeof setQueueConfig>[0] = {};
if (aiConcurrency != null) queueOverrides.concurrency = aiConcurrency;
else if (deprecatedConcurrency != null) queueOverrides.concurrency = deprecatedConcurrency;
if (aiRetries != null) queueOverrides.maxRetries = aiRetries;
if (aiTimeoutMs != null) queueOverrides.timeoutMs = aiTimeoutMs;
if (Object.keys(queueOverrides).length > 0) setQueueConfig(queueOverrides);

if (deprecatedConcurrency != null && aiConcurrency == null) {
  process.stderr.write(
    "\x1b[2mNote: --concurrency is deprecated; use --ai-concurrency to control LLM throughput.\x1b[0m\n",
  );
}

// ── Job-event sink (for end-of-command summary) ───────────

interface JobStats {
  succeeded: number;
  retried: number;
  failed: number;
  failuresByPrefix: Map<string, string[]>;
}

const stats: JobStats = {
  succeeded: 0,
  retried: 0,
  failed: 0,
  failuresByPrefix: new Map(),
};
const seenRetried = new Set<string>();

const recordEvent = (e: JobEvent): void => {
  if (e.kind === "retrying") seenRetried.add(e.name);
  if (e.kind === "succeeded") {
    stats.succeeded++;
    if (seenRetried.has(e.name)) {
      stats.retried++;
      seenRetried.delete(e.name);
    }
  }
  if (e.kind === "failed") {
    stats.failed++;
    seenRetried.delete(e.name);
    const prefix = e.name.split(":")[0] ?? "ai";
    const list = stats.failuresByPrefix.get(prefix) ?? [];
    list.push(e.name);
    stats.failuresByPrefix.set(prefix, list);
  }
};

onJobEvent(recordEvent);

const printJobSummary = (): void => {
  if (stats.succeeded + stats.retried + stats.failed === 0) return;
  process.stderr.write(
    `\x1b[2mAI jobs: ${stats.succeeded} succeeded, ${stats.retried} retried, ${stats.failed} failed\x1b[0m\n`,
  );
  if (stats.failed > 0) {
    process.stderr.write("\x1b[2mFailures clustered by name prefix:\x1b[0m\n");
    for (const [prefix, names] of stats.failuresByPrefix) {
      const sample = names.slice(0, 5).join(", ");
      const more = names.length > 5 ? ` (+${names.length - 5} more)` : "";
      process.stderr.write(
        `\x1b[2m  ${prefix}:* — ${names.length} failed (${sample}${more})\x1b[0m\n`,
      );
    }
  }
};

// ── Command dispatch ──────────────────────────────────────

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
      return evalCommand(evalPath, jsonFlag);
    }

    case "compare": {
      const jsonFlag = args.includes("--json");
      const positional = args.filter((a, i) => i > 0 && !a.startsWith("--"));
      const [first, second] = positional;
      if (first == null || second == null) {
        console.error("Usage: skillet compare <eval-source-skill> <comparison-skill> [--json]");
        return 1;
      }
      return compareCommand(first, second, { json: jsonFlag });
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

    case "resume":
      return resumeCommand(args.slice(1));

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
  skillet create <description>                            Create a new skill from a description
  skillet improve [path]                                  Improve an existing skill (auto-imports legacy skills)
  skillet eval [path] [--json]                            Run evals
  skillet compare <a> <b> [--json]                        Run skill A's evals against both A and B; print side-by-side
  skillet verify [path] [--semantic]                      Check spec/SKILL.md/evals agree (subsumes the old validate)
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

  SKILLET_MODEL              Override agent model (e.g. anthropic/claude-sonnet-4-20250514)
  SKILLET_JUDGE_MODEL        Override judge model separately
  SKILLET_EVAL_GEN_MODEL     Override the model used for per-behavior eval generation
  SKILLET_AI_CONCURRENCY=N   Max concurrent LLM calls (same as --ai-concurrency)
  SKILLET_AI_RETRIES=N       Max retry attempts per LLM call (default 3)
  SKILLET_AI_TIMEOUT=ms      Per-call wall-clock timeout (default 240000)
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
