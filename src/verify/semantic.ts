import type { Context } from "@mariozechner/pi-ai";
import { completeWithBackoff } from "../agent/complete-with-backoff.js";
import { submitAiJob } from "../agent/queue.js";
import type { AnyModel } from "../agent/provider.js";
import { extractText, isRecord, stripFences } from "../authoring/phases/_text.js";
import type { Behavior, MustNot, SkillSpec } from "../spec/index.js";
import type { SemanticBehaviorVerdict, SemanticReport, SemanticVerdict } from "./types.js";

/**
 * Layer 4 verification: LLM-judged semantic check that SKILL.md
 * encodes every spec behavior and must_not. Opt-in via the
 * `--semantic` flag — never invoked by the default authoring loop.
 *
 * The judge sees the spec and the SKILL.md text and returns one
 * verdict per behavior:
 * - `encoded`: the rule is reflected clearly in SKILL.md
 * - `partial`: referenced but with weakened or incomplete wording
 * - `missing`: not reflected at all
 *
 * Failures here surface skills where the gen prompt produced a
 * SKILL.md that's plausible-looking but actually drops a rule.
 */
const SYSTEM_PROMPT = `You are checking whether a skill's runtime SKILL.md actually
encodes each rule from its source-of-truth spec.

You receive:
1. A list of behavior rules (positive: things the skill MUST do) and
   must_not rules (negative: things the skill MUST NOT do), each with
   an ID, statement, and optional rationale.
2. The full SKILL.md content the skill author has produced.

For each rule, decide:
- encoded: the rule appears in SKILL.md with wording that an agent
  reading SKILL.md would clearly infer the rule, even if phrased
  differently.
- partial: a related concept appears but the rule is weakened, made
  conditional in a way the spec didn't intend, or buried where the
  agent would miss it.
- missing: the rule is absent or only mentioned in passing without
  being acted on.

Be strict: if you have to squint to find the rule, that's missing or
partial, not encoded. The whole point of this check is to catch
SKILL.md drops.

Output one JSON object per line, in the input order, with fields
"id", "verdict" (one of encoded/partial/missing), and "reasoning"
(one short sentence). Wrap the output in a single JSON array.`;

interface RawVerdict {
  id?: unknown;
  verdict?: unknown;
  reasoning?: unknown;
}

interface SemanticRuleInput {
  id: string;
  kind: "behavior" | "must_not";
  statement: string;
  rationale?: string;
}

const SEMANTIC_BATCH_SIZE = 12;

const isVerdict = (v: unknown): v is SemanticVerdict => {
  return v === "encoded" || v === "partial" || v === "missing";
};

const toRules = (behaviors: Behavior[], mustNots: MustNot[]): SemanticRuleInput[] => {
  return [
    ...behaviors.map((b) => ({
      id: b.id,
      kind: "behavior" as const,
      statement: b.statement,
      rationale: b.rationale,
    })),
    ...mustNots.map((m) => ({
      id: m.id,
      kind: "must_not" as const,
      statement: m.statement,
      rationale: m.rationale,
    })),
  ];
};

const formatRules = (rules: SemanticRuleInput[]): string => {
  return rules
    .map((r) => {
      const label = r.kind === "behavior" ? "behavior" : "must_not";
      const rationale = r.rationale != null ? `\n  rationale: ${r.rationale}` : "";
      return `- kind: ${label}\n  id: ${r.id}\n  statement: ${r.statement}${rationale}`;
    })
    .join("\n");
};

const chunks = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
};

const parseJsonArray = (text: string): unknown[] => {
  const stripped = stripFences(text, "json");
  try {
    const parsed: unknown = JSON.parse(stripped);
    if (!Array.isArray(parsed)) {
      throw new Error("semantic judge response was JSON but not an array");
    }
    return parsed;
  } catch (firstErr: unknown) {
    const start = stripped.indexOf("[");
    const end = stripped.lastIndexOf("]");
    if (start === -1 || end === -1 || end <= start) {
      const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
      throw new Error(`semantic judge response was not a JSON array: ${msg}`, { cause: firstErr });
    }
    const candidate = stripped.slice(start, end + 1);
    const parsed: unknown = JSON.parse(candidate);
    if (!Array.isArray(parsed)) {
      throw new Error("semantic judge response was JSON but not an array", { cause: firstErr });
    }
    return parsed;
  }
};

/**
 * Run the semantic verification call. The caller is expected to have
 * already passed structural / coverage layers — semantic is the
 * deepest check and only meaningful when the rest of the artifacts
 * are in shape.
 */
export const verifySemantic = async (
  spec: SkillSpec,
  skillMd: string,
  judgeModel: AnyModel,
): Promise<SemanticReport> => {
  const out: SemanticBehaviorVerdict[] = [];

  let batchIndex = 0;
  for (const batch of chunks(toRules(spec.behaviors, spec.must_not), SEMANTIC_BATCH_SIZE)) {
    batchIndex++;
    const rules = formatRules(batch);
    const userContent = `## Rules to check in this batch\n\n${rules}\n\n## SKILL.md\n\n${skillMd}\n\nReturn one JSON array of verdicts for this batch only, in the same order as the rules above.`;

    const context: Context = {
      systemPrompt: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent, timestamp: Date.now() }],
    };

    const response = await submitAiJob({
      name: `verify-semantic:batch-${batchIndex}`,
      run: (signal) => completeWithBackoff(judgeModel, context, { maxTokens: 3000, signal }),
    });
    const text = extractText(response);

    let parsed: unknown[];
    try {
      parsed = parseJsonArray(text);
    } catch {
      for (const rule of batch) {
        out.push({
          id: rule.id,
          kind: rule.kind,
          verdict: "missing",
          reasoning: "judge response was not valid JSON; cannot determine semantic coverage",
        });
      }
      continue;
    }

    const verdictsById = new Map<string, RawVerdict>();
    for (const v of parsed) {
      if (!isRecord(v)) continue;
      const id = v.id;
      if (typeof id === "string") {
        verdictsById.set(id, { id, verdict: v.verdict, reasoning: v.reasoning });
      }
    }

    for (const rule of batch) {
      const raw = verdictsById.get(rule.id);
      out.push(toVerdict(rule.id, rule.kind, raw));
    }
  }

  const ok = out.every((v) => v.verdict === "encoded");
  return { ok, behaviors: out };
};

const toVerdict = (
  id: string,
  kind: "behavior" | "must_not",
  raw: RawVerdict | undefined,
): SemanticBehaviorVerdict => {
  if (raw == null) {
    return {
      id,
      kind,
      verdict: "missing",
      reasoning: "judge did not return a verdict for this id",
    };
  }
  const verdict = isVerdict(raw.verdict) ? raw.verdict : "missing";
  const reasoning = typeof raw.reasoning === "string" ? raw.reasoning : "";
  return { id, kind, verdict, reasoning };
};
