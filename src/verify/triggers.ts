import type { Context } from "@mariozechner/pi-ai";
import { completeWithBackoff } from "../agent/complete-with-backoff.js";
import { submitAiJob } from "../agent/queue.js";
import type { AnyModel } from "../agent/provider.js";
import { extractText, isRecord, stripFences } from "../authoring/phases/_text.js";
import type { SkillSpec } from "../spec/index.js";
import type { TriggerPhraseVerdict, TriggerReport, TriggerVerdict } from "./types.js";

/**
 * Layer 5 verification: LLM-judged trigger quality check. Given the
 * SKILL.md description (the text an agent dispatcher reads to decide
 * whether to activate the skill) and the spec's trigger lists, the
 * judge evaluates whether each `should` phrase would activate and
 * each `should_not` phrase would correctly NOT activate.
 *
 * Verdicts:
 * - `activates`: the description clearly covers (or clearly excludes)
 *   this phrase — correct behavior expected.
 * - `weak`: the phrase is borderline — a dispatcher might or might not
 *   activate, depending on interpretation.
 * - `fails`: the description would cause wrong behavior — a `should`
 *   phrase that wouldn't activate, or a `should_not` that would.
 */
const SYSTEM_PROMPT = `You are evaluating whether an agent skill's description would
correctly activate (or not activate) for specific user queries.

You receive:
1. The skill's SKILL.md content — this is what an agent dispatcher
   reads to decide whether to route a user's request to this skill.
   Focus on the frontmatter "description" field and the opening
   sections; those are what dispatchers key on.
2. Two lists of trigger phrases:
   - "should" phrases: queries that MUST activate this skill.
   - "should_not" phrases: queries that MUST NOT activate this skill.

For each phrase, decide:
- activates: a dispatcher reading this description would clearly
  match (for "should") or clearly reject (for "should_not") this
  phrase. The description's wording unambiguously covers it.
- weak: the phrase is borderline. The description partially
  overlaps but a dispatcher could reasonably go either way. For
  "should" phrases this means the skill might not fire; for
  "should_not" phrases it means the skill might incorrectly fire.
- fails: the description would cause wrong behavior. A "should"
  phrase has no match in the description, or a "should_not" phrase
  is strongly matched by the description.

Be practical: dispatchers do fuzzy semantic matching, not keyword
lookup. "review django perf" should match a description mentioning
"Django performance review" even without exact words. But "review
React components" should NOT match a Django-only skill.

Output a JSON array. Each element has fields "kind" ("should" or
"should_not"), "phrase" (the exact input phrase), "verdict" (one of
activates/weak/fails), and "reasoning" (one short sentence).`;

const isVerdictValue = (v: unknown): v is TriggerVerdict => {
  return v === "activates" || v === "weak" || v === "fails";
};

export const verifyTriggers = async (
  spec: SkillSpec,
  skillMd: string,
  judgeModel: AnyModel,
): Promise<TriggerReport> => {
  const allPhrases = [
    ...spec.triggers.should.map((p) => ({ kind: "should" as const, phrase: p })),
    ...spec.triggers.should_not.map((p) => ({ kind: "should_not" as const, phrase: p })),
  ];

  if (allPhrases.length === 0) {
    return { ok: true, triggers: [] };
  }

  const phraseList = allPhrases.map((p) => `- [${p.kind}] "${p.phrase}"`).join("\n");

  const userContent = `## Trigger phrases to evaluate\n\n${phraseList}\n\n## SKILL.md\n\n${skillMd}\n\nReturn one JSON array of verdicts, one per phrase, in the input order.`;

  const context: Context = {
    systemPrompt: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent, timestamp: Date.now() }],
  };

  const response = await submitAiJob({
    name: "verify-triggers",
    run: (signal) => completeWithBackoff(judgeModel, context, { maxTokens: 2000, signal }),
  });
  const text = extractText(response);

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(text, "json"));
  } catch {
    const fallback: TriggerPhraseVerdict[] = allPhrases.map((p) => ({
      kind: p.kind,
      phrase: p.phrase,
      verdict: "fails" as const,
      reasoning: "judge response was not valid JSON; cannot determine trigger quality",
    }));
    return { ok: false, triggers: fallback };
  }

  if (!Array.isArray(parsed)) {
    return { ok: false, triggers: [] };
  }

  const verdicts: TriggerPhraseVerdict[] = [];
  for (const [i, expected] of allPhrases.entries()) {
    const raw = parsed[i];
    if (raw != null && isRecord(raw) && isVerdictValue(raw.verdict)) {
      verdicts.push({
        kind: expected.kind,
        phrase: expected.phrase,
        verdict: raw.verdict,
        reasoning: typeof raw.reasoning === "string" ? raw.reasoning : "",
      });
    } else {
      verdicts.push({
        kind: expected.kind,
        phrase: expected.phrase,
        verdict: "fails",
        reasoning: "judge did not return a verdict for this phrase",
      });
    }
  }

  const ok = verdicts.every((v) => v.verdict === "activates");
  return { ok, triggers: verdicts };
};
