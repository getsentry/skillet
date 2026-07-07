import { parseArgs } from "node:util";
import { assertBinaryAvailable, HarnessConfigError, resolveHarness } from "../harness/config.js";
import { emitJson, fail, info } from "../output.js";
import { passRate, summarizeByBehavior } from "../evals/results.js";
import type { CaseResult } from "../evals/results.js";
import { runCases } from "../evals/runner.js";
import { validateSkill } from "../validate.js";
import { print, resolveSkillRoot } from "./shared.js";

const HELP = `Usage: skillet eval [path] [options]

Run the skill's eval cases through the configured harness.

Options:
  --case <id>         Run a single case
  --trials <n>        Run each case n times and report pass rates
  --baseline          Also run every trial without the skill; report lift
  --harness <name>    Override the harness (codex, claude)
  --keep-workspaces   Leave trial workspaces on disk for debugging
  --json              Machine-readable results on stdout
`;

const percent = (rate: number): string => `${Math.round(rate * 100)}%`;

const printCase = (result: CaseResult): void => {
  const rate = passRate(result.trials);
  const trialWord = `${result.trials.filter((t) => t.status === "pass").length}/${result.trials.length}`;
  print(
    `  ${rate === 1 ? "✓" : "✗"} ${result.id} (${result.behavior}) — ${trialWord} trials passed`,
  );
  for (const [i, trial] of result.trials.entries()) {
    if (trial.status === "pass") continue;
    const label = result.trials.length > 1 ? ` trial ${i + 1}` : "";
    if (trial.error != null) {
      print(`      error${label}: ${trial.error}`);
      continue;
    }
    for (const check of trial.checks) {
      if (check.status === "pass") continue;
      print(`      ${check.status}${label}: ${check.kind} ${check.value}`);
      if (check.output != null) {
        print(`        ${check.output.split("\n").slice(0, 4).join("\n        ")}`);
      }
    }
  }
};

export const run = async (argv: string[]): Promise<number> => {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      case: { type: "string" },
      trials: { type: "string" },
      baseline: { type: "boolean" },
      harness: { type: "string" },
      "keep-workspaces": { type: "boolean" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });
  if (values.help === true) {
    info(HELP);
    return 0;
  }

  const root = resolveSkillRoot(positionals[0]);
  if (root == null) return 1;

  const trials = values.trials != null ? Number(values.trials) : undefined;
  if (trials != null && (!Number.isInteger(trials) || trials < 1)) {
    return fail("--trials must be a positive integer");
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
  if (cases.length === 0) {
    return fail("no eval cases found under evals/cases/");
  }

  let harness;
  try {
    harness = resolveHarness(root, values.harness);
    assertBinaryAvailable(harness);
  } catch (err) {
    if (err instanceof HarnessConfigError) return fail(err.message);
    throw err;
  }

  info(
    `Running ${cases.length} case(s) via ${harness.name}${values.baseline === true ? " (with baseline)" : ""}...`,
  );
  const results = await runCases(cases, {
    skillRoot: root,
    harness,
    ...(trials != null && { trials }),
    ...(values.baseline === true && { baseline: true }),
    ...(values["keep-workspaces"] === true && { keepWorkspaces: true }),
    onProgress: (message) => {
      info(`  ${message}`);
    },
  });

  const behaviors = summarizeByBehavior(results);
  const allTrials = results.flatMap((r) => r.trials);
  const summary = {
    harness: harness.name,
    cases: results.length,
    trials: allTrials.length,
    passed: allTrials.filter((t) => t.status === "pass").length,
    failed: allTrials.filter((t) => t.status === "fail").length,
    errored: allTrials.filter((t) => t.status === "error").length,
  };
  const ok = summary.failed === 0 && summary.errored === 0 && summary.passed > 0;

  if (values.json === true) {
    emitJson({ summary, behaviors, cases: results });
    return ok ? 0 : 1;
  }

  print(``);
  for (const result of results) printCase(result);
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
    `${summary.passed}/${summary.trials} trials passed via ${summary.harness}` +
      (summary.errored > 0 ? ` (${summary.errored} errored)` : ""),
  );
  return ok ? 0 : 1;
};
