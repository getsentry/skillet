import type { Context } from "@mariozechner/pi-ai";
import { completeWithBackoff } from "../../agent/complete-with-backoff.js";
import type { AnyModel } from "../../agent/provider.js";
import type { EvalRunResult } from "../../eval/index.js";
import { renderSpec, validateSpecPatch, type SkillSpec, type SpecPatch } from "../../spec/index.js";
import type { CoverageReport, ResultsReport } from "../../verify/index.js";
import { buildAssessPrompt } from "../prompts/assess.js";

const stripFences = (text: string): string => {
  const fence = /^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/i.exec(text.trim());
  return fence?.[1]?.trim() ?? text.trim();
};

const extractText = (response: { content: unknown[] }): string => {
  return response.content
    .filter((b): b is { type: "text"; text: string; textSignature?: string } => {
      return typeof b === "object" && b != null && (b as { type?: unknown }).type === "text";
    })
    .map((b) => b.text)
    .join("");
};

/**
 * Render the failure data the assessor needs into a single text
 * block. Includes only what's relevant — orphan and uncovered IDs,
 * per-behavior verdicts, and the failed cases' transcripts/reasoning.
 * Passing cases are omitted to keep context lean.
 */
const formatFailures = (
  coverage: CoverageReport,
  results: ResultsReport | undefined,
  evalRun: EvalRunResult,
): string => {
  const blocks: string[] = [];

  if (coverage.uncovered.length > 0 || coverage.orphans.length > 0 || coverage.issues.length > 0) {
    const lines: string[] = ["## Coverage gaps"];
    for (const u of coverage.uncovered) {
      lines.push(`- uncovered ${u.kind}:${u.id} — ${u.statement}`);
    }
    for (const o of coverage.orphans) {
      lines.push(`- orphan case ${o.caseName} → tests_behavior=${o.testsBehavior} (no spec entry)`);
    }
    for (const issue of coverage.issues) {
      lines.push(`- ${issue.path}: ${issue.message}`);
    }
    blocks.push(lines.join("\n"));
  }

  if (results != null) {
    const failing = results.behaviors.filter((b) => b.status !== "covered+passing");
    if (failing.length > 0) {
      const lines: string[] = ["## Per-behavior verdicts (failures only)"];
      for (const v of failing) {
        lines.push(
          `- ${v.kind}:${v.id} → ${v.status} (cases: ${v.caseNames.join(", ") || "none"})`,
        );
      }
      blocks.push(lines.join("\n"));
    }
  }

  const failedCases = evalRun.cases.filter((c) => c.status === "fail" || c.status === "error");
  if (failedCases.length > 0) {
    const lines: string[] = ["## Failed eval cases (full detail)"];
    for (const c of failedCases) {
      lines.push(`### ${c.name} — ${c.status.toUpperCase()}`);
      if (c.tests_behavior != null) lines.push(`tests_behavior: ${c.tests_behavior}`);
      for (const check of c.checks) {
        if (!check.passed) lines.push(`  ✗ ${check.name}: ${check.detail}`);
      }
      if (c.judge != null) {
        lines.push(`  judge: ${c.judge.grade} (${c.judge.score}) — ${c.judge.reasoning}`);
      }
      for (const err of c.errors) {
        lines.push(`  ERROR: ${err.message}`);
      }
      lines.push("");
    }
    blocks.push(lines.join("\n"));
  }

  return blocks.join("\n\n");
};

/**
 * Run the assessment phase: failure data → SpecPatch[].
 *
 * Returns an empty array when the assessor decides no patch will
 * help (the loop interprets this as "give up", terminating with the
 * verify report rather than spinning forever).
 */
export const runAssess = async (
  model: AnyModel,
  spec: SkillSpec,
  coverage: CoverageReport,
  results: ResultsReport | undefined,
  evalRun: EvalRunResult,
): Promise<SpecPatch[]> => {
  const failureSummary = formatFailures(coverage, results, evalRun);
  const specYaml = renderSpec(spec);
  const userContent = `## Current spec.yaml\n\n${specYaml}\n\n${failureSummary}`;

  const context: Context = {
    systemPrompt: buildAssessPrompt(),
    messages: [{ role: "user", content: userContent, timestamp: Date.now() }],
  };

  const response = await completeWithBackoff(model, context);
  if (response.stopReason === "error") {
    const errMsg = response.errorMessage ?? "unknown error";
    throw new Error(`assess: LLM returned error: ${errMsg}`);
  }

  const raw = stripFences(extractText(response));
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`assess: LLM output is not valid JSON: ${msg}\n\nRaw output:\n${raw}`, {
      cause: err,
    });
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`assess: LLM output is not a JSON array of patches\n\nRaw output:\n${raw}`);
  }

  return parsed.map(validateSpecPatch);
};
