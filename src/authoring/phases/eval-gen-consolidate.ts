/**
 * Cross-behavior consolidation pass for eval-gen.
 *
 * Runs ONCE after all per-entry generate+verify pairs settle.
 * Pure function, no LLM calls, no I/O. Produces a result the
 * caller writes to disk:
 *
 *   - `judges`: deduped judge declarations (canonical set across
 *     the whole skill). Sorted by name for stable output.
 *   - `perEntry`: per-entry `ConsolidatedPlan`s, with case
 *     `fixtureSlug` set when the source case had a `fixture`
 *     map. The plans no longer carry inline judge declarations
 *     or fixture content.
 *   - `fixtures`: map of `caseSlug` → file map. Caller writes
 *     each entry to `evals/fixtures/<caseSlug>/...`.
 *   - `conflicts`: same-named judges with diverging criteria —
 *     non-fatal; surfaced for telemetry so users can audit.
 *
 * Dedup heuristic: exact name match. First criterion wins. Two
 * plans declaring `IdentifiesPrivilegedTriggerJudge` with the
 * same criterion collapse cleanly; with different criteria,
 * the first wins and the second is logged as a conflict.
 */

import type {
  AssertionPlan,
  CasePlan,
  ConsolidatedCasePlan,
  ConsolidatedPlan,
  JudgePlan,
} from "./eval-gen-types.js";

export interface ConsolidationInput {
  entryId: string;
  plan: AssertionPlan;
}

export interface ConsolidationConflict {
  judgeName: string;
  /** All distinct criteria observed for this name, first-encountered first. */
  criteria: string[];
  /** Entry IDs that contributed each criterion, in the same order. */
  entryIds: string[][];
}

export interface ConsolidationResult {
  judges: JudgePlan[];
  perEntry: Array<{ entryId: string; plan: ConsolidatedPlan }>;
  /**
   * caseSlug (= case `name`) → relative path → file content.
   * Caller writes each one to `evals/fixtures/<slug>/<rel>` on disk.
   */
  fixtures: Record<string, Record<string, string>>;
  conflicts: ConsolidationConflict[];
  /** Total declared judges across all input plans (pre-dedup). */
  totalDeclared: number;
}

interface JudgeRecord {
  /** First-encountered criterion (canonical). */
  canonical: string;
  /** All distinct criteria observed, in encounter order. */
  variants: string[];
  /** Per-variant: which entry IDs declared it. */
  entryIds: string[][];
}

export const consolidate = (inputs: ConsolidationInput[]): ConsolidationResult => {
  const judgeMap = new Map<string, JudgeRecord>();
  const perEntry: Array<{ entryId: string; plan: ConsolidatedPlan }> = [];
  const fixtures: Record<string, Record<string, string>> = {};
  let totalDeclared = 0;

  for (const { entryId, plan } of inputs) {
    totalDeclared += plan.judges.length;
    for (const judge of plan.judges) {
      const existing = judgeMap.get(judge.name);
      if (existing == null) {
        judgeMap.set(judge.name, {
          canonical: judge.criterion,
          variants: [judge.criterion],
          entryIds: [[entryId]],
        });
        continue;
      }
      const variantIdx = existing.variants.indexOf(judge.criterion);
      if (variantIdx === -1) {
        existing.variants.push(judge.criterion);
        existing.entryIds.push([entryId]);
      } else {
        const list = existing.entryIds[variantIdx];
        if (list != null) list.push(entryId);
      }
    }

    const consolidatedCases = plan.cases.map((c) => consolidateCase(c, fixtures));
    perEntry.push({ entryId, plan: { cases: consolidatedCases } });
  }

  // Canonical judge list — sorted by name for stable file output.
  const judges: JudgePlan[] = [...judgeMap.entries()]
    .map(([name, rec]) => ({ name, criterion: rec.canonical }))
    // oxlint-disable-next-line unicorn/no-array-sort
    .sort((a, b) => a.name.localeCompare(b.name));

  const conflicts: ConsolidationConflict[] = [];
  for (const [name, rec] of judgeMap.entries()) {
    if (rec.variants.length > 1) {
      conflicts.push({
        judgeName: name,
        criteria: rec.variants,
        entryIds: rec.entryIds,
      });
    }
  }

  return { judges, perEntry, fixtures, conflicts, totalDeclared };
};

const consolidateCase = (
  c: CasePlan,
  fixtures: Record<string, Record<string, string>>,
): ConsolidatedCasePlan => {
  const out: ConsolidatedCasePlan = {
    name: c.name,
    tests_behavior: c.tests_behavior,
    input: c.input,
    assertions: c.assertions,
  };
  if (c.timeout != null) out.timeout = c.timeout;
  if (c.fixture != null && Object.keys(c.fixture).length > 0) {
    fixtures[c.name] = c.fixture;
    out.fixtureSlug = c.name;
  } else if (c.setup != null && c.setup !== "") {
    // Hand-authored legacy plans: pass `setup` straight through; the
    // renderer falls back to `harness.setup(<script>)` for these.
    out.setup = c.setup;
  }
  return out;
};
