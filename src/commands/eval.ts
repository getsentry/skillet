import { resolve } from "node:path";
import { findSkillRoot, loadSkill } from "../skill/loader.js";
import { discoverEvalTsFiles } from "../eval/discovery.js";
import { runVitestEvals } from "../eval/vitest-runner.js";
import { printSummary } from "../output/pretty.js";
import { printJsonResult } from "../output/json.js";

const errorMessage = (err: unknown): string => {
  return err instanceof Error ? err.message : String(err);
};

export const evalCommand = async (
  pathArg?: string,
  jsonOutput = false,
  concurrency?: number,
  againstPath?: string,
): Promise<number> => {
  const startPath = resolve(pathArg ?? ".");

  let skillRoot: string;
  try {
    skillRoot = findSkillRoot(startPath);
  } catch (err: unknown) {
    console.error(`Error: ${errorMessage(err)}`);
    return 1;
  }

  const skill = loadSkill(skillRoot);

  // --against: run the eval cases with another skill's SKILL.md as
  // the system prompt. The eval data (inputs, criteria, expected
  // contains) stays the same; only the skill body changes. This is
  // a fair head-to-head — same cases, same judge, two skills.
  let comparisonSkillRoot: string | undefined;
  if (againstPath != null) {
    try {
      comparisonSkillRoot = findSkillRoot(resolve(againstPath));
      // Validate the comparison skill loads cleanly before spawning
      // vitest — surfaces malformed SKILL.md immediately rather than
      // producing N case-level failures.
      loadSkill(comparisonSkillRoot);
    } catch (err: unknown) {
      console.error(`Error: --against skill is invalid: ${errorMessage(err)}`);
      return 1;
    }
  }

  // Distinguish "no eval files exist" from "eval files exist but
  // vitest failed to load them" before invoking the runner. Saves
  // time on empty skills and gives a clear message.
  const evalFiles = discoverEvalTsFiles(skillRoot);
  if (evalFiles.length === 0) {
    if (jsonOutput) {
      printJsonResult({
        cases: [],
        summary: { total: 0, pass: 0, fail: 0, skip: 0, error: 0, durationMs: 0 },
      });
    } else {
      console.log(`\nSkill: ${skill.meta.name}`);
      console.log(`Root:  ${skill.root}\n`);
      console.log("No eval files found in evals/ (looking for *.eval.ts).");
    }
    return 0;
  }

  if (!jsonOutput) {
    console.log(`\nSkill: ${skill.meta.name}`);
    console.log(`Root:  ${skill.root}`);
    if (comparisonSkillRoot != null) {
      const compareSkill = loadSkill(comparisonSkillRoot);
      console.log(`Against: ${compareSkill.meta.name} (${comparisonSkillRoot})`);
    }
    console.log(`Eval files: ${evalFiles.length}\n`);
  }

  let result;
  try {
    const runOpts: Parameters<typeof runVitestEvals>[0] = {
      skillRoot,
      // Stream vitest's progress when not in --json mode so the user
      // sees per-test events instead of a quiet wait followed by a
      // summary block. Vitest's reporter handles per-case lines, so
      // we don't subscribe to onCaseComplete in streaming mode.
      streamProgress: !jsonOutput,
    };
    if (concurrency != null) runOpts.maxConcurrency = concurrency;
    if (comparisonSkillRoot != null) runOpts.compareSkillRoot = comparisonSkillRoot;
    result = await runVitestEvals(runOpts);
  } catch (err: unknown) {
    if (jsonOutput) {
      console.log(
        JSON.stringify(
          {
            ok: false,
            error: errorMessage(err),
            evalFiles,
          },
          null,
          2,
        ),
      );
    } else {
      console.error(`Error: ${errorMessage(err)}`);
    }
    return 1;
  }

  if (jsonOutput) {
    printJsonResult(result);
  } else {
    printSummary(result);
  }

  return result.summary.fail + result.summary.error > 0 ? 1 : 0;
};
