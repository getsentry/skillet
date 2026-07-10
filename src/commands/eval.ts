import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  HarnessConfigError,
  loadConfig,
  requireBinary,
  resolveHarness,
} from "../harness/config.js";
import { requireSandbox, resolveSandbox, type SandboxConfig } from "../harness/sandbox.js";
import type { ResolvedHarness } from "../harness/types.js";
import type { DryJson, EvalJson, EvalSummary } from "../json.js";
import { emitJson, fail, info, print } from "../output.js";
import { passRate, summarizeByBehavior, type CaseResult } from "../evals/results.js";
import { dryRun, runCases } from "../evals/runner.js";
import { validateSkill } from "../validate.js";
import { resolveSkillRoot } from "./shared.js";

const HELP = `Usage: skillet eval [path] [options]

Run the skill's eval cases through the configured harness.

Options:
  --case <id>         Run a single case
  --behavior <id>     Run only the cases covering one behavior
  --trials <n>        Run each case n times and report pass rates
  --baseline          Also run every trial without the skill; report lift
  --harness <name>    Override the harness (codex, claude)
  --sandbox <mode>    docker: run every harness invocation in a container
                      (none: force direct). Default from .skillet.yaml.
  --keep-workspaces   Leave trial workspaces on disk for debugging
  --out <dir>         Persist each case's result as <dir>/<case-id>.json as it
                      finishes; existing files are reused (resume after a kill)
  --dry               No agent: run checks against the pristine workspace;
                      any check that passes there is vacuous and flagged
  --verbose           Print full transcripts for non-passing trials
  --json              Machine-readable results on stdout

Exit codes: 0 all trials passed, 1 otherwise.
`;

const percent = (rate: number): string => `${Math.round(rate * 100)}%`;

const printCase = (result: CaseResult, verbose: boolean): void => {
  const rate = passRate(result.trials);
  const passed = result.trials.filter((t) => t.status === "pass").length;
  const totalSeconds = Math.round(result.trials.reduce((ms, t) => ms + t.durationMs, 0) / 1000);
  print(
    `  ${rate === 1 ? "✓" : "✗"} ${result.id} (${result.behavior}) — ${passed}/${result.trials.length} trials passed, ${totalSeconds}s`,
  );
  for (const [i, trial] of result.trials.entries()) {
    if (trial.status === "pass") continue;
    const label = result.trials.length > 1 ? ` trial ${i + 1}` : "";
    if (trial.status === "error") {
      print(`      error${label}: ${trial.error}`);
    }
    for (const check of trial.checks) {
      if (check.status === "pass" || check.status === "skipped") continue;
      print(`      ${check.status}${label}: ${check.kind} ${check.value}`);
      print(`        ${check.output.split("\n").slice(0, 4).join("\n        ")}`);
    }
    if (verbose && trial.transcript.trim() !== "") {
      print(`      transcript${label}:`);
      print(
        trial.transcript
          .split("\n")
          .map((line) => `        ${line}`)
          .join("\n"),
      );
    }
  }
};

/** `skillet eval` — run cases through the harness, report rates and lift. */
export const run = async (argv: string[]): Promise<number> => {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      case: { type: "string" },
      behavior: { type: "string" },
      trials: { type: "string" },
      baseline: { type: "boolean" },
      harness: { type: "string" },
      sandbox: { type: "string" },
      "keep-workspaces": { type: "boolean" },
      out: { type: "string" },
      dry: { type: "boolean" },
      verbose: { type: "boolean" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });
  if (values.help === true) {
    print(HELP.trimEnd());
    return 0;
  }

  const root = resolveSkillRoot(positionals[0]);
  if (root == null) return 1;

  const trials = values.trials != null ? Number(values.trials) : undefined;
  if (trials != null && (!Number.isInteger(trials) || trials < 1)) {
    return fail("--trials must be a positive integer");
  }

  let harness: ResolvedHarness;
  let sandbox: SandboxConfig | null;
  try {
    const config = loadConfig(root);
    harness = resolveHarness(config, values.harness);
    sandbox = resolveSandbox(config, values.sandbox);
    if (sandbox != null) {
      requireSandbox(sandbox, harness);
    } else {
      requireBinary(harness);
    }
  } catch (error) {
    if (error instanceof HarnessConfigError) return fail(error.message);
    throw error;
  }

  // Validate before spending any agent invocations.
  const report = validateSkill(root);
  if (!report.ok) {
    return fail("skill is invalid — run 'skillet validate' and fix the errors first");
  }

  let cases = report.evalCases;
  if (values.case != null) {
    cases = cases.filter((c) => c.id === values.case);
    if (cases.length === 0) {
      return fail(
        `no case named "${values.case}" — available: ${report.evalCases.map((c) => c.id).join(", ")}`,
      );
    }
  }
  if (values.behavior != null) {
    cases = cases.filter((c) => c.behavior === values.behavior);
    if (cases.length === 0) {
      const behaviors = [...new Set(report.evalCases.map((c) => c.behavior))];
      return fail(
        `no cases cover behavior "${values.behavior}" — covered: ${behaviors.join(", ")}`,
      );
    }
  }
  if (cases.length === 0) {
    return fail("no eval cases found under evals/cases/");
  }

  if (values.dry === true) {
    const dry = dryRun(cases, root);
    const ok = dry.every((c) => !c.vacuous);
    if (values.json === true) {
      const payload: DryJson = { ok, cases: dry };
      emitJson(payload);
      return 0;
    }
    for (const c of dry) {
      const judges = c.judges > 0 ? ` (${c.judges} judge check(s) not dry-runnable)` : "";
      if (c.vacuous) {
        print(`  ⚠ ${c.id} — a do-nothing agent would pass this case${judges}`);
        print(
          `      fine if it deliberately tests that the agent does NOT act; otherwise tighten the checks`,
        );
      } else {
        print(`  ✓ ${c.id} — requires the agent to act${judges}`);
      }
      for (const check of c.pristinePass) {
        print(`      passes pristine (invariant guard?): ${check.kind}: ${check.value}`);
      }
    }
    print(``);
    print(
      ok
        ? "Dry run clean: no case passes with a do-nothing agent."
        : "Review the ⚠ cases: suppression-style cases are expected there; anything else is a vacuous eval.",
    );
    return 0;
  }

  const outDir = values.out != null ? resolve(values.out) : null;
  const cached: CaseResult[] = [];
  if (outDir != null) {
    mkdirSync(outDir, { recursive: true });
    const remaining = [];
    for (const c of cases) {
      const cachedPath = join(outDir, `${c.id}.json`);
      if (existsSync(cachedPath)) {
        const parsed: unknown = JSON.parse(readFileSync(cachedPath, "utf8"));
        cached.push(parsed as CaseResult);
        info(`  ${c.id}: cached (${cachedPath})`);
      } else {
        remaining.push(c);
      }
    }
    cases = remaining;
  }

  info(
    `Running ${cases.length} case(s) via ${harness.name}${sandbox != null ? " [docker sandbox]" : ""}${values.baseline === true ? " (with baseline)" : ""}...`,
  );
  const fresh = await runCases(cases, {
    skillRoot: root,
    harness,
    sandbox,
    ...(trials != null && { trials }),
    ...(values.baseline === true && { baseline: true }),
    ...(values["keep-workspaces"] === true && { keepWorkspaces: true }),
    onProgress: (message) => {
      info(`  ${message}`);
    },
    ...(outDir != null && {
      onCaseDone: (result: CaseResult) => {
        writeFileSync(join(outDir, `${result.id}.json`), `${JSON.stringify(result, null, 2)}\n`);
      },
    }),
  });
  const results = [...cached, ...fresh];

  const behaviors = summarizeByBehavior(results);
  const allTrials = results.flatMap((r) => r.trials);
  const summary: EvalSummary = {
    harness: harness.name,
    cases: results.length,
    trials: allTrials.length,
    passed: allTrials.filter((t) => t.status === "pass").length,
    failed: allTrials.filter((t) => t.status === "fail").length,
    errored: allTrials.filter((t) => t.status === "error").length,
  };
  const ok = summary.failed === 0 && summary.errored === 0 && summary.passed > 0;

  if (values.json === true) {
    const payload: EvalJson = { ok, summary, behaviors, cases: results };
    emitJson(payload);
    return ok ? 0 : 1;
  }

  print(``);
  for (const result of results) printCase(result, values.verbose === true);
  print(``);
  print(`Behaviors:`);
  for (const b of behaviors) {
    const baseline =
      b.baselinePassRate != null && b.lift != null
        ? ` | baseline ${percent(b.baselinePassRate)} | lift ${b.lift >= 0 ? "+" : ""}${percent(b.lift)}`
        : "";
    print(`  ${b.behavior}: ${percent(b.passRate)} (${b.passed}/${b.trials})${baseline}`);
  }
  print(``);
  print(
    `${summary.passed}/${summary.trials} trials passed via ${summary.harness}${summary.errored > 0 ? ` (${summary.errored} errored)` : ""}`,
  );
  const keptDirs = results
    .flatMap((r) => [...r.trials, ...(r.baselineTrials ?? [])])
    .flatMap((t) => (t.workspace != null ? [t.workspace] : []));
  if (keptDirs.length > 0) {
    print(``);
    print(`Kept workspaces:`);
    for (const dir of keptDirs) print(`  ${dir}`);
  }
  return ok ? 0 : 1;
};
