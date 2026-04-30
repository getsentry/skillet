import type { Context } from "@mariozechner/pi-ai";
import { completeWithBackoff } from "../../agent/complete-with-backoff.js";
import type { AnyModel } from "../../agent/provider.js";
import { submitAiJob } from "../../agent/queue.js";
import type { EvalRunResult } from "../../eval/index.js";
import type { SkillSpec } from "../../spec/index.js";
import { buildSkillImprovePrompt } from "../prompts/skill-improve.js";
import { extractText } from "./_text.js";
import { SKILL_MD_BANNER } from "./skill-gen.js";

const formatFailures = (runResult: EvalRunResult): string => {
  const failed = runResult.cases.filter((c) => c.status === "fail" || c.status === "error");
  if (failed.length === 0) return "(no failed cases — improve was invoked anyway)";

  const lines: string[] = [];
  for (const c of failed) {
    lines.push(`### ${c.name} — ${c.status.toUpperCase()}`);
    if (c.tests_behavior != null) lines.push(`tests_behavior: ${c.tests_behavior}`);
    for (const check of c.checks) {
      if (!check.passed) lines.push(`  ✗ ${check.name}: ${check.detail}`);
    }
    if (c.judge != null) {
      lines.push(`  judge: ${c.judge.grade} (${c.judge.score}) — ${c.judge.reasoning}`);
    }
    if (c.session.outputText != null && c.session.outputText !== "") {
      const snippet = c.session.outputText.slice(0, 600);
      lines.push(`  agent transcript: ${snippet}${c.session.outputText.length > 600 ? "..." : ""}`);
    }
    for (const err of c.errors) lines.push(`  ERROR: ${err.message}`);
    lines.push("");
  }
  return lines.join("\n");
};

/**
 * Run the skill-improve phase: regenerate SKILL.md given current
 * spec, current SKILL.md, and failing-eval context. Returns the new
 * SKILL.md content (with banner injected, same as skill-gen).
 *
 * Spec is read-only here. The improver only tunes prose.
 */
export const runSkillImprove = (
  model: AnyModel,
  spec: SkillSpec,
  currentSkillMd: string,
  evalRun: EvalRunResult,
): Promise<string> => {
  return submitAiJob({
    name: `skill-improve:${spec.name}`,
    run: (signal) => runSkillImproveInner(model, spec, currentSkillMd, evalRun, signal),
  });
};

const runSkillImproveInner = async (
  model: AnyModel,
  spec: SkillSpec,
  currentSkillMd: string,
  evalRun: EvalRunResult,
  signal: AbortSignal,
): Promise<string> => {
  const specJson = JSON.stringify(
    {
      name: spec.name,
      intent: spec.intent,
      triggers: spec.triggers,
      behaviors: spec.behaviors.map((b) => ({
        id: b.id,
        statement: b.statement,
        rationale: b.rationale,
      })),
      must_not: spec.must_not.map((m) => ({
        id: m.id,
        statement: m.statement,
        rationale: m.rationale,
        leakage_risk: m.leakage_risk,
      })),
      references: spec.references ?? [],
    },
    null,
    2,
  );

  const failureSummary = formatFailures(evalRun);
  const userContent = `## Spec (FIXED — do not add/remove behaviors)\n\n\`\`\`json\n${specJson}\n\`\`\`\n\n## Current SKILL.md\n\n${currentSkillMd}\n\n## Failing eval cases\n\n${failureSummary}\n\nProduce a new SKILL.md with prose tuned to make the failing cases pass. The behavior set is fixed.`;

  const context: Context = {
    systemPrompt: buildSkillImprovePrompt(),
    messages: [{ role: "user", content: userContent, timestamp: Date.now() }],
  };

  const response = await completeWithBackoff(model, context, { signal });
  if (response.stopReason === "error") {
    const errMsg = response.errorMessage ?? "unknown error";
    throw new Error(`skill-improve: LLM returned error: ${errMsg}`);
  }

  const raw = extractText(response).trim();
  return injectDerivedBanner(raw);
};

/**
 * Same banner-injection logic as skill-gen, kept here to avoid a
 * cyclic dependency. If the LLM omitted frontmatter, prepend the
 * banner anyway so the file still carries the warning.
 */
const injectDerivedBanner = (skillMd: string): string => {
  if (!skillMd.startsWith("---")) {
    return SKILL_MD_BANNER + "\n" + skillMd;
  }
  const closingIdx = skillMd.indexOf("\n---", 3);
  if (closingIdx === -1) {
    return SKILL_MD_BANNER + "\n" + skillMd;
  }
  const afterFence = closingIdx + 4;
  const next = skillMd.indexOf("\n", afterFence);
  const splitAt = next === -1 ? skillMd.length : next + 1;
  return skillMd.slice(0, splitAt) + "\n" + SKILL_MD_BANNER + skillMd.slice(splitAt);
};
