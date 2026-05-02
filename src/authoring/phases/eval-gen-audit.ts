/**
 * Post-consolidate audit pass. One LLM call sees the canonical
 * judge set + per-entry usage and proposes `merge-judges` edits
 * to collapse near-duplicates. Single pass — no retry loop.
 *
 * Failures (parse, applier, validation) fall back to the unedited
 * consolidation with a warn event so the user can audit.
 */

import type { Context } from "@mariozechner/pi-ai";
import { completeWithBackoff } from "../../agent/complete-with-backoff.js";
import type { AnyModel } from "../../agent/provider.js";
import { submitAiJob } from "../../agent/queue.js";
import { event } from "../../log.js";
import { buildEvalGenAuditPrompt } from "../prompts/eval-gen-audit-suite.js";
import { saveFailedOutput } from "./_diagnostics.js";
import { extractText, isRecord, stripFences } from "./_text.js";
import {
  applySuiteEdits,
  type ConsolidationResult,
  SuiteEditError,
} from "./eval-gen-consolidate.js";
import type { SuiteEdit, SuiteVerdict } from "./eval-gen-types.js";

/**
 * Build the per-judge usage map: judge name → list of entry IDs
 * whose cases reference it. Used as the audit prompt's input.
 */
const buildJudgeUsage = (c: ConsolidationResult): Record<string, string[]> => {
  const usage: Record<string, Set<string>> = {};
  for (const j of c.judges) usage[j.name] = new Set();
  for (const { entryId, plan } of c.perEntry) {
    for (const c2 of plan.cases) {
      for (const a of c2.assertions) {
        if (a.kind === "judge" && usage[a.judgeName] != null) {
          usage[a.judgeName]?.add(entryId);
        }
      }
    }
  }
  const out: Record<string, string[]> = {};
  for (const [name, entries] of Object.entries(usage)) {
    // oxlint-disable-next-line unicorn/no-array-sort
    out[name] = [...entries].sort();
  }
  return out;
};

/**
 * Run the audit pass. Returns the (possibly edited) consolidation.
 * Skips the LLM call entirely when there are <2 judges (nothing
 * to merge).
 */
export const auditConsolidationSafely = async (
  model: AnyModel,
  consolidation: ConsolidationResult,
  log?: (msg: string) => void,
): Promise<ConsolidationResult> => {
  if (consolidation.judges.length < 2) return consolidation;

  let verdict: SuiteVerdict;
  try {
    verdict = await submitAiJob({
      name: `eval-gen:audit-suite`,
      run: (signal) => auditConsolidation(model, consolidation, signal),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    event("warn", `eval-gen-audit-suite call-failed`, { message: msg });
    return consolidation;
  }

  if (verdict.approve) {
    event("info", `eval-gen-audit-suite approve=true judges=${consolidation.judges.length}`);
    return consolidation;
  }
  if (verdict.edits.length === 0) {
    event("info", `eval-gen-audit-suite approve=false but no edits — treated as approve`);
    return consolidation;
  }
  try {
    const edited = applySuiteEdits(consolidation, verdict.edits);
    event(
      "info",
      `eval-gen-audit-suite edits-applied count=${verdict.edits.length} canonical=${consolidation.judges.length}->${edited.judges.length}`,
    );
    log?.(
      `  audit merged ${verdict.edits.length} judge group(s); ${consolidation.judges.length} -> ${edited.judges.length} canonical`,
    );
    return edited;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const tag = err instanceof SuiteEditError ? "edit-failed" : "edit-render-invalid";
    event("warn", `eval-gen-audit-suite ${tag}`, { message: msg, editCount: verdict.edits.length });
    return consolidation;
  }
};

const auditConsolidation = async (
  model: AnyModel,
  consolidation: ConsolidationResult,
  signal: AbortSignal,
): Promise<SuiteVerdict> => {
  const usage = buildJudgeUsage(consolidation);
  const userContent = `Audit the canonical judge set across the suite. Look for near-duplicate judges (different names, same property) and propose merges. Return JSON.\n\n## Judges\n\n\`\`\`json\n${JSON.stringify(
    consolidation.judges,
    null,
    2,
  )}\n\`\`\`\n\n## Usage (judge name → entries that reference it)\n\n\`\`\`json\n${JSON.stringify(
    usage,
    null,
    2,
  )}\n\`\`\``;

  const context: Context = {
    systemPrompt: buildEvalGenAuditPrompt(),
    messages: [{ role: "user", content: userContent, timestamp: Date.now() }],
  };

  const response = await completeWithBackoff(model, context, { maxTokens: 8000, signal });
  const text = extractText(response);

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(text, "json"));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const saved = saveFailedOutput({
      phase: "eval-gen-audit-suite",
      key: "suite",
      attempt: 1,
      raw: text,
      errorMessage: `response was not valid JSON: ${msg}`,
      kind: "parse",
    });
    event("warn", `eval-gen-audit-suite parse-fail`, {
      message: msg,
      savedTo: saved.path,
      responseHead: saved.excerpt,
    });
    return { approve: true };
  }

  const verdict = parseSuiteVerdict(parsed);
  if (verdict == null) {
    const saved = saveFailedOutput({
      phase: "eval-gen-audit-suite",
      key: "suite",
      attempt: 1,
      raw: text,
      errorMessage: "verdict shape is neither {approve:true} nor {approve:false, edits:[...]}",
      kind: "schema",
    });
    event("warn", `eval-gen-audit-suite bad-shape`, { savedTo: saved.path });
    return { approve: true };
  }
  return verdict;
};

const parseSuiteVerdict = (raw: unknown): SuiteVerdict | null => {
  if (!isRecord(raw)) return null;
  if (raw.approve === true) return { approve: true };
  if (raw.approve !== false) return null;
  if (!Array.isArray(raw.edits)) return null;
  const edits: SuiteEdit[] = [];
  for (const e of raw.edits) {
    if (!isRecord(e)) return null;
    // Trust shape — applier validates and throws on missing targets.
    // oxlint-disable-next-line no-unsafe-type-assertion
    edits.push(e as unknown as SuiteEdit);
  }
  return { approve: false, edits };
};
