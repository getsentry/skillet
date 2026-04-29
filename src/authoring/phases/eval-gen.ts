import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Context } from "@mariozechner/pi-ai";
import { completeWithBackoff } from "../../agent/complete-with-backoff.js";
import type { AnyModel } from "../../agent/provider.js";
import type { Behavior, MustNot, SkillSpec } from "../../spec/index.js";
import { buildEvalGenPrompt } from "../prompts/eval-gen.js";
import { extractText, isRecord, stripFences } from "./_text.js";

/**
 * Banner placed at the top of generated eval files. Eval files are
 * generated initially but durable after that — regen leaves them
 * alone if they exist, so direct edits to refine prompts/setup/
 * assertions stick. Behavior set changes (add/remove rules) flow
 * through spec.yaml; new behaviors get freshly generated files,
 * removed behaviors leave orphan files (verify coverage flags them).
 */
export const EVAL_TS_BANNER = `// ──────────────────────────────────────────────────────────
// Generated initially from spec.yaml; durable after that. Edit
// freely to refine prompts, setup, and assertions for this
// behavior. Add or remove behaviors via spec.yaml — skillet only
// regenerates eval files for behaviors that don't have one yet.
// ──────────────────────────────────────────────────────────
`;

export interface RunEvalGenResult {
  /** Files written this run (new behavior IDs only). */
  written: string[];
  /** Behavior IDs whose eval file already existed and was preserved. */
  skipped: string[];
}

/** Shape skillet enforces on each case object emitted by the LLM. */
interface RawCase {
  name: string;
  input: string;
  tests_behavior: string;
  expectedContains?: string;
  criteria?: string;
  setup?: string;
  timeout?: number;
}

const isString = (v: unknown): v is string => typeof v === "string";
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Validate that an LLM-produced object matches the case schema, and
 * return a typed copy. Throws on malformed input — caller retries.
 */
const validateCase = (raw: unknown, index: number, validIds: Set<string>): RawCase => {
  if (!isRecord(raw)) {
    throw new Error(`case ${index}: not a JSON object`);
  }
  if (!isString(raw.name) || raw.name === "") {
    throw new Error(`case ${index}: missing 'name'`);
  }
  if (!isString(raw.input) || raw.input === "") {
    throw new Error(`case ${index} (${raw.name}): missing 'input'`);
  }
  if (!isString(raw.tests_behavior) || raw.tests_behavior === "") {
    throw new Error(`case ${index} (${raw.name}): missing 'tests_behavior'`);
  }
  if (!validIds.has(raw.tests_behavior)) {
    throw new Error(
      `case ${index} (${raw.name}): tests_behavior '${raw.tests_behavior}' is not in the requested set`,
    );
  }
  const out: RawCase = {
    name: raw.name,
    input: raw.input,
    tests_behavior: raw.tests_behavior,
  };
  if (isString(raw.expectedContains) && raw.expectedContains !== "") {
    out.expectedContains = raw.expectedContains;
  }
  if (isString(raw.criteria) && raw.criteria !== "") {
    out.criteria = raw.criteria;
  }
  if (out.expectedContains == null && out.criteria == null) {
    throw new Error(`case ${index} (${raw.name}): must have 'expectedContains' or 'criteria'`);
  }
  if (isString(raw.setup) && raw.setup !== "") out.setup = raw.setup;
  if (isNumber(raw.timeout)) out.timeout = raw.timeout;
  return out;
};

/**
 * Render a single behavior's eval file. The wrapper is fixed —
 * skillet provides describeEval, judges, and the harness, so the LLM
 * only contributes the case list. The describeEval suite name is the
 * behavior id so vitest's reporter groups output by behavior.
 */
const renderEvalFile = (behaviorId: string, cases: RawCase[]): string => {
  const dataLines: string[] = [];
  for (const c of cases) {
    const obj: string[] = [];
    obj.push(`    name: ${JSON.stringify(c.name)}`);
    obj.push(`    tests_behavior: ${JSON.stringify(c.tests_behavior)}`);
    obj.push(`    input: ${JSON.stringify(c.input)}`);
    if (c.expectedContains != null) {
      obj.push(`    expectedContains: ${JSON.stringify(c.expectedContains)}`);
    }
    if (c.criteria != null) {
      obj.push(`    criteria: ${JSON.stringify(c.criteria)}`);
    }
    if (c.setup != null) {
      obj.push(`    setup: ${JSON.stringify(c.setup)}`);
    }
    if (c.timeout != null) {
      obj.push(`    timeout: ${c.timeout}`);
    }
    dataLines.push(`  {\n${obj.join(",\n")},\n  },`);
  }

  return `${EVAL_TS_BANNER}import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import {
  describeEval,
  CriterionJudge,
  SubstringJudge,
  skilletHarness,
} from "@sentry/skillet/evals";

const skillRoot = dirname(fileURLToPath(import.meta.url)).replace(/\\/evals$/, "");

describeEval(${JSON.stringify(behaviorId)}, {
  data: [
${dataLines.join("\n")}
  ],
  harness: skilletHarness({ skill: skillRoot }),
  judges: [SubstringJudge(), CriterionJudge()],
  threshold: 0.75,
  timeout: 120_000,
});
`;
};

/**
 * Group LLM-produced cases by their `tests_behavior` field. Each group
 * becomes one eval file. The set of valid IDs is provided so the
 * validator can reject cases that target unknown behaviors.
 */
const groupCasesById = (cases: RawCase[]): Map<string, RawCase[]> => {
  const groups = new Map<string, RawCase[]>();
  for (const c of cases) {
    const list = groups.get(c.tests_behavior) ?? [];
    list.push(c);
    groups.set(c.tests_behavior, list);
  }
  return groups;
};

const callLlm = async (
  model: AnyModel,
  entries: Array<Behavior | MustNot>,
  kind: Map<string, "behavior" | "must_not">,
): Promise<RawCase[]> => {
  const validIds = new Set(entries.map((e) => e.id));
  const input = {
    behaviors: entries
      .filter((e) => kind.get(e.id) === "behavior")
      .map((b) => ({ id: b.id, statement: b.statement, rationale: b.rationale })),
    must_not: entries
      .filter((e) => kind.get(e.id) === "must_not")
      .map((m) => {
        const mn = m as MustNot;
        return {
          id: mn.id,
          statement: mn.statement,
          rationale: mn.rationale,
          leakage_risk: mn.leakage_risk,
        };
      }),
  };

  const userContent = `Generate eval cases for the following spec entries:\n\n\`\`\`json\n${JSON.stringify(input, null, 2)}\n\`\`\``;
  const context: Context = {
    systemPrompt: buildEvalGenPrompt(),
    messages: [{ role: "user", content: userContent, timestamp: Date.now() }],
  };

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      context.messages.push({
        role: "user",
        content: `Your previous output failed validation: ${lastError?.message}\n\nReturn a valid JSON array of cases — only the array, no prose, no fences.`,
        timestamp: Date.now(),
      });
    }
    const response = await completeWithBackoff(model, context, { maxTokens: 8000 });
    context.messages.push(response);
    const text = extractText(response);
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripFences(text, "json"));
    } catch (err: unknown) {
      lastError = new Error(
        `response was not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      );
      continue;
    }
    if (!Array.isArray(parsed)) {
      lastError = new Error("response was JSON but not an array");
      continue;
    }
    try {
      return parsed.map((raw, i) => validateCase(raw, i, validIds));
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      continue;
    }
  }

  throw new Error(`eval-gen: failed after 3 attempts. Last error: ${lastError?.message}`);
};

/**
 * Run the eval-gen phase: spec entries → one `.eval.ts` file per
 * behavior/must_not.
 *
 * Files are written directly to `<skillRoot>/evals/<id>.eval.ts`.
 * Existing files are PRESERVED — regen never overwrites a file the
 * user (or a prior run) has already produced. This is what makes
 * eval files durable: edit the prompt, assertion, or setup directly
 * and the change survives the next regen.
 *
 * Behaviors removed from the spec leave orphan files behind. Verify
 * coverage flags them; the user deletes manually.
 */
export const runEvalGen = async (
  model: AnyModel,
  spec: SkillSpec,
  skillRoot: string,
  opts: { logProgress?: ((msg: string) => void) | undefined } = {},
): Promise<RunEvalGenResult> => {
  const log = opts.logProgress;
  const evalsDir = join(skillRoot, "evals");

  const entries: Array<Behavior | MustNot> = [...spec.behaviors, ...spec.must_not];
  const kind = new Map<string, "behavior" | "must_not">();
  for (const b of spec.behaviors) kind.set(b.id, "behavior");
  for (const m of spec.must_not) kind.set(m.id, "must_not");

  const skipped: string[] = [];
  const missing: Array<Behavior | MustNot> = [];
  for (const entry of entries) {
    const filePath = join(evalsDir, `${entry.id}.eval.ts`);
    if (existsSync(filePath)) {
      skipped.push(entry.id);
    } else {
      missing.push(entry);
    }
  }

  log?.(`eval-gen: ${missing.length} new file(s) to generate, ${skipped.length} preserved`);

  if (missing.length === 0) {
    return { written: [], skipped };
  }

  const cases = await callLlm(model, missing, kind);
  const groups = groupCasesById(cases);

  // Every entry in `missing` should have at least one case. If the
  // LLM dropped one, that's a bug; surface it loudly so the user can
  // re-run rather than silently shipping a coverage gap.
  const dropped = missing.filter((e) => !groups.has(e.id));
  if (dropped.length > 0) {
    throw new Error(
      `eval-gen: LLM produced no cases for ${dropped.length} entry(ies): ${dropped.map((e) => e.id).join(", ")}`,
    );
  }

  mkdirSync(evalsDir, { recursive: true });
  const written: string[] = [];
  for (const entry of missing) {
    const groupCases = groups.get(entry.id) ?? [];
    const filePath = join(evalsDir, `${entry.id}.eval.ts`);
    writeFileSync(filePath, renderEvalFile(entry.id, groupCases), "utf-8");
    written.push(filePath);
    log?.(`  wrote ${filePath}`);
  }

  return { written, skipped };
};
