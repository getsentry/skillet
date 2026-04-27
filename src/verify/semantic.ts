import type { Context } from "@mariozechner/pi-ai";
import { completeWithBackoff } from "../agent/complete-with-backoff.js";
import type { AnyModel } from "../agent/provider.js";
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

const isVerdict = (v: unknown): v is SemanticVerdict => {
  return v === "encoded" || v === "partial" || v === "missing";
};

const isRecord = (val: unknown): val is Record<string, unknown> => {
  return val != null && typeof val === "object" && !Array.isArray(val);
};

const stripFences = (text: string): string => {
  const fence = /^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/i.exec(text.trim());
  return fence?.[1]?.trim() ?? text.trim();
};

const formatRules = (behaviors: Behavior[], mustNots: MustNot[]): string => {
  const blocks: string[] = [];
  if (behaviors.length > 0) {
    blocks.push(
      "## Behavior rules (skill MUST do)\n\n" +
        behaviors
          .map((b) => {
            const rationale = b.rationale != null ? `\n  rationale: ${b.rationale}` : "";
            return `- id: ${b.id}\n  statement: ${b.statement}${rationale}`;
          })
          .join("\n"),
    );
  }
  if (mustNots.length > 0) {
    blocks.push(
      "## Must-not rules (skill MUST NOT do)\n\n" +
        mustNots
          .map((m) => {
            const rationale = m.rationale != null ? `\n  rationale: ${m.rationale}` : "";
            return `- id: ${m.id}\n  statement: ${m.statement}${rationale}`;
          })
          .join("\n"),
    );
  }
  return blocks.join("\n\n");
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
  const rules = formatRules(spec.behaviors, spec.must_not);
  const userContent = `${rules}\n\n## SKILL.md\n\n${skillMd}\n\nReturn one JSON array of verdicts in spec order.`;

  const context: Context = {
    systemPrompt: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent, timestamp: Date.now() }],
  };

  const response = await completeWithBackoff(judgeModel, context, { maxTokens: 2000 });
  const text = response.content
    .filter((b): b is { type: "text"; text: string; textSignature?: string } => b.type === "text")
    .map((b) => b.text)
    .join("");

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(text));
  } catch {
    // The judge produced malformed JSON. We can't grade — treat every
    // rule as `missing` so the user sees the failure rather than a
    // silent green light.
    const fallback: SemanticBehaviorVerdict[] = [];
    for (const b of spec.behaviors) {
      fallback.push({
        id: b.id,
        kind: "behavior",
        verdict: "missing",
        reasoning: "judge response was not valid JSON; cannot determine semantic coverage",
      });
    }
    for (const m of spec.must_not) {
      fallback.push({
        id: m.id,
        kind: "must_not",
        verdict: "missing",
        reasoning: "judge response was not valid JSON; cannot determine semantic coverage",
      });
    }
    return { ok: false, behaviors: fallback };
  }

  if (!Array.isArray(parsed)) {
    return {
      ok: false,
      behaviors: [],
    };
  }

  const verdictsById = new Map<string, RawVerdict>();
  for (const v of parsed) {
    if (!isRecord(v)) continue;
    const id = v.id;
    if (typeof id === "string") {
      verdictsById.set(id, { id, verdict: v.verdict, reasoning: v.reasoning });
    }
  }

  const out: SemanticBehaviorVerdict[] = [];
  for (const b of spec.behaviors) {
    const raw = verdictsById.get(b.id);
    out.push(toVerdict(b.id, "behavior", raw));
  }
  for (const m of spec.must_not) {
    const raw = verdictsById.get(m.id);
    out.push(toVerdict(m.id, "must_not", raw));
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
