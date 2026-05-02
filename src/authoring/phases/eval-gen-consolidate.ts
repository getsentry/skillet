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
  MergeJudgesEdit,
  SuiteEdit,
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
  }
  return out;
};

// ── Suite-edit applier ─────────────────────────────────────────────────────

const JUDGE_NAME_RE = /^[A-Z][A-Za-z0-9]*Judge$/;

export class SuiteEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SuiteEditError";
  }
}

/**
 * Apply a list of `SuiteEdit`s to a consolidation result. Pure
 * function — produces a new `ConsolidationResult` without mutating
 * the input. Throws `SuiteEditError` on missing targets / malformed
 * edits; caller falls back to the unedited consolidation on throw.
 *
 * The fixture map is unchanged — suite edits operate only on judges
 * and the per-entry plans' references to them.
 */
export const applySuiteEdits = (
  consolidation: ConsolidationResult,
  edits: SuiteEdit[],
): ConsolidationResult => {
  if (edits.length === 0) return consolidation;
  const next: ConsolidationResult = {
    judges: structuredClone(consolidation.judges),
    perEntry: structuredClone(consolidation.perEntry),
    fixtures: consolidation.fixtures,
    conflicts: consolidation.conflicts,
    totalDeclared: consolidation.totalDeclared,
  };
  for (const [i, edit] of edits.entries()) {
    try {
      applySuiteEdit(next, edit);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new SuiteEditError(`suite-edit[${i}] (${edit.kind}): ${msg}`);
    }
  }
  return next;
};

const applySuiteEdit = (c: ConsolidationResult, edit: SuiteEdit): void => {
  switch (edit.kind) {
    case "merge-judges":
      return applyMergeJudges(c, edit);
    default: {
      const exhaustive: never = edit.kind;
      throw new SuiteEditError(`unknown suite-edit kind: ${JSON.stringify(exhaustive)}`);
    }
  }
};

const applyMergeJudges = (c: ConsolidationResult, edit: MergeJudgesEdit): void => {
  if (typeof edit.canonical !== "string" || !JUDGE_NAME_RE.test(edit.canonical)) {
    throw new SuiteEditError(`canonical "${edit.canonical}" must be PascalCase ending in "Judge"`);
  }
  if (!Array.isArray(edit.merged) || edit.merged.length === 0) {
    throw new SuiteEditError(`merged must be a non-empty array`);
  }
  const canonicalIdx = c.judges.findIndex((j) => j.name === edit.canonical);
  if (canonicalIdx < 0) {
    throw new SuiteEditError(`canonical judge "${edit.canonical}" not found in suite`);
  }
  const mergedSet = new Set<string>();
  for (const name of edit.merged) {
    if (typeof name !== "string" || name === "") {
      throw new SuiteEditError(`merged names must be non-empty strings`);
    }
    if (name === edit.canonical) {
      throw new SuiteEditError(`merged list contains canonical "${edit.canonical}" (no-op)`);
    }
    if (!c.judges.some((j) => j.name === name)) {
      throw new SuiteEditError(`merged judge "${name}" not found in suite`);
    }
    mergedSet.add(name);
  }
  // Optional criterion override.
  if (edit.criterion != null) {
    if (typeof edit.criterion !== "string" || edit.criterion.trim() === "") {
      throw new SuiteEditError(`criterion override must be a non-empty string`);
    }
    const canonical = c.judges[canonicalIdx];
    if (canonical != null) canonical.criterion = edit.criterion;
  }
  // Drop merged declarations.
  c.judges = c.judges.filter((j) => !mergedSet.has(j.name));
  // Rewrite every per-entry case's `judge` assertions to point at the canonical.
  // Dedupe in place — if a case ended up referencing the canonical AND a
  // merged-from name, it gets two identical references after rewrite; collapse.
  for (const { plan } of c.perEntry) {
    for (const c2 of plan.cases) {
      const seen = new Set<string>();
      const out: typeof c2.assertions = [];
      for (const a of c2.assertions) {
        if (a.kind === "judge") {
          const target = mergedSet.has(a.judgeName) ? edit.canonical : a.judgeName;
          if (target === edit.canonical) {
            if (seen.has(edit.canonical)) continue;
            seen.add(edit.canonical);
            out.push({ kind: "judge", judgeName: edit.canonical });
          } else {
            out.push(a);
          }
        } else {
          out.push(a);
        }
      }
      c2.assertions = out;
    }
  }
};
