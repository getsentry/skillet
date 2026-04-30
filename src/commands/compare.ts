import { resolve } from "node:path";
import { discoverEvalTsFiles } from "../eval/discovery.js";
import { runVitestEvals } from "../eval/vitest-runner.js";
import type { EvalCaseResult, EvalRunResult } from "../eval/index.js";
import { findSkillRoot, loadSkill, type Skill } from "../skill/loader.js";

const errorMessage = (err: unknown): string => {
  return err instanceof Error ? err.message : String(err);
};

interface CompareEntry {
  skill: { name: string; root: string };
  result: EvalRunResult;
}

interface CompareReport {
  evalSource: { name: string; root: string };
  evalFileCount: number;
  skills: CompareEntry[];
}

const ICON_PASS = "[32m✓[0m";
const ICON_FAIL = "[31m✗[0m";
const ICON_SKIP = "[2m○[0m";

const statusIcon = (s: EvalCaseResult["status"]): string => {
  if (s === "pass") return ICON_PASS;
  if (s === "fail") return ICON_FAIL;
  return ICON_SKIP;
};

const collectStatuses = (result: EvalRunResult): Map<string, EvalCaseResult["status"]> => {
  const out = new Map<string, EvalCaseResult["status"]>();
  for (const c of result.cases) {
    out.set(c.name, c.status);
  }
  return out;
};

const padRight = (s: string, width: number): string => {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
};

const printSideBySide = (report: CompareReport): void => {
  const allCaseNames = new Set<string>();
  const statusesPerSkill = report.skills.map((s) => collectStatuses(s.result));
  for (const m of statusesPerSkill) {
    for (const name of m.keys()) allCaseNames.add(name);
  }
  // Sort case names for stable side-by-side rendering. We make a
  // copy to satisfy oxlint's no-array-sort (Array#sort mutates).
  const orderedCases = [...allCaseNames];
  orderedCases.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const nameColWidth = Math.max(
    20,
    orderedCases.reduce((acc, n) => Math.max(acc, n.length), 0) + 2,
  );
  const skillNames = report.skills.map((s) => s.skill.name);
  const skillColWidths = skillNames.map((n) => Math.max(8, n.length + 2));

  console.log("\nPer-case comparison:");
  const header =
    padRight("case", nameColWidth) +
    skillNames.map((n, i) => padRight(n, skillColWidths[i] ?? 0)).join("");
  console.log(`  ${header}`);
  for (const caseName of orderedCases) {
    const cells = statusesPerSkill.map((m, i) => {
      const status = m.get(caseName);
      const icon = status != null ? statusIcon(status) : ICON_SKIP;
      // ANSI codes inflate string length; pad relative to the visible character.
      const visibleWidth = (skillColWidths[i] ?? 0) - 1;
      return icon + " ".repeat(Math.max(0, visibleWidth));
    });
    console.log(`  ${padRight(caseName, nameColWidth)}${cells.join("")}`);
  }

  console.log("\nSummary:");
  for (const entry of report.skills) {
    const { pass, total, durationMs } = entry.result.summary;
    const pct = total === 0 ? 0 : Math.round((pass / total) * 100);
    console.log(
      `  ${padRight(entry.skill.name, nameColWidth)} ${pass}/${total} (${pct}%) — ${(durationMs / 1000).toFixed(1)}s`,
    );
  }
};

const validateSkill = (path: string, label: string): { skill: Skill; root: string } => {
  let root: string;
  try {
    root = findSkillRoot(resolve(path));
  } catch (err: unknown) {
    throw new Error(`${label} '${path}' is not a skill: ${errorMessage(err)}`, { cause: err });
  }
  let skill: Skill;
  try {
    skill = loadSkill(root);
  } catch (err: unknown) {
    throw new Error(`${label} '${path}' failed to load: ${errorMessage(err)}`, { cause: err });
  }
  return { skill, root };
};

interface CompareOptions {
  json?: boolean;
}

export const COMPARE_USAGE = `Usage: skillet compare <eval-source-skill> <comparison-skill> [--json]

Run skill A's evals against both A and B; print side-by-side. Concurrency
is governed by the global AI job queue (--ai-concurrency).`;

export const compareCommand = async (
  evalSourceArg: string,
  comparisonArg: string,
  opts: CompareOptions = {},
): Promise<number> => {
  const jsonOutput = opts.json === true;

  let evalSource: { skill: Skill; root: string };
  let comparison: { skill: Skill; root: string };
  try {
    evalSource = validateSkill(evalSourceArg, "first skill");
    comparison = validateSkill(comparisonArg, "second skill");
  } catch (err: unknown) {
    console.error(`Error: ${errorMessage(err)}`);
    return 1;
  }

  const evalFiles = discoverEvalTsFiles(evalSource.root);
  if (evalFiles.length === 0) {
    console.error(
      `Error: ${evalSource.skill.meta.name} has no eval files in ${evalSource.root}/evals/ — nothing to compare.`,
    );
    return 1;
  }

  if (!jsonOutput) {
    console.log(`\nEval source: ${evalSource.skill.meta.name} (${evalSource.root})`);
    console.log(`Eval files:  ${evalFiles.length}`);
    console.log(`Comparing:   ${evalSource.skill.meta.name} ↔ ${comparison.skill.meta.name}\n`);
  }

  // Run both sequentially. Each invocation spawns vitest; running
  // them in parallel would double the LLM concurrency cap and risk
  // tripping provider rate limits on bigger suites.
  const runs: CompareEntry[] = [];
  for (const target of [
    {
      label: evalSource.skill.meta.name,
      root: evalSource.root,
      compareWith: undefined as string | undefined,
    },
    { label: comparison.skill.meta.name, root: evalSource.root, compareWith: comparison.root },
  ]) {
    if (!jsonOutput) {
      console.log(`──────── Run: ${target.label} ────────`);
    }
    let result: EvalRunResult;
    try {
      const runOpts: Parameters<typeof runVitestEvals>[0] = {
        skillRoot: target.root,
        streamProgress: !jsonOutput,
      };
      if (target.compareWith != null) runOpts.compareSkillRoot = target.compareWith;
      result = await runVitestEvals(runOpts);
    } catch (err: unknown) {
      if (jsonOutput) {
        console.log(
          JSON.stringify(
            { ok: false, error: errorMessage(err), failedSkill: target.label },
            null,
            2,
          ),
        );
      } else {
        console.error(`Error running ${target.label}: ${errorMessage(err)}`);
      }
      return 1;
    }
    runs.push({
      skill: { name: target.label, root: target.compareWith ?? target.root },
      result,
    });
  }

  const report: CompareReport = {
    evalSource: { name: evalSource.skill.meta.name, root: evalSource.root },
    evalFileCount: evalFiles.length,
    skills: runs,
  };

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printSideBySide(report);
  }

  // Non-zero only if BOTH skills failed; a comparison where one
  // passes and the other fails is the expected diagnostic shape.
  const allFailed = runs.every((r) => r.result.summary.fail + r.result.summary.error > 0);
  return allFailed ? 1 : 0;
};
