import type { Context } from "@mariozechner/pi-ai";
import { completeWithBackoff } from "../../agent/complete-with-backoff.js";
import type { AnyModel } from "../../agent/provider.js";
import type { MustNot, SkillSpec } from "../../spec/index.js";
import { buildEvalGenPrompt } from "../prompts/eval-gen.js";
import { extractText, isRecord, stripFences } from "./_text.js";

/**
 * Banner placed at the top of generated eval files. Points readers
 * at spec.yaml as the source of intent — but this file is the
 * durable test artifact (committed to git, edited directly when
 * test details need to change).
 */
export const EVAL_TS_BANNER = `// ──────────────────────────────────────────────────────────
// Generated from spec.yaml. Behaviors and triggers come from the
// spec; eval prompts/setup/assertions live here. Edit spec.yaml
// to add/remove behaviors. Edit this file directly to refine
// specific test shapes.
// ──────────────────────────────────────────────────────────
`;

/** Shape skillet enforces on each case object emitted by the LLM. */
interface RawCase {
  name: string;
  input: string;
  tests_behavior?: string;
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
const validateCase = (raw: unknown, index: number): RawCase => {
  if (!isRecord(raw)) {
    throw new Error(`case ${index}: not a JSON object`);
  }
  if (!isString(raw.name) || raw.name === "") {
    throw new Error(`case ${index}: missing 'name'`);
  }
  if (!isString(raw.input) || raw.input === "") {
    throw new Error(`case ${index} (${raw.name}): missing 'input'`);
  }
  const hasContains = isString(raw.expectedContains) && raw.expectedContains !== "";
  const hasCriteria = isString(raw.criteria) && raw.criteria !== "";
  if (!hasContains && !hasCriteria) {
    throw new Error(`case ${index} (${raw.name}): must have 'expectedContains' or 'criteria'`);
  }
  const out: RawCase = { name: raw.name, input: raw.input };
  if (isString(raw.tests_behavior) && raw.tests_behavior !== "") {
    out.tests_behavior = raw.tests_behavior;
  }
  if (isString(raw.expectedContains) && raw.expectedContains !== "") {
    out.expectedContains = raw.expectedContains;
  }
  if (isString(raw.criteria) && raw.criteria !== "") {
    out.criteria = raw.criteria;
  }
  if (isString(raw.setup) && raw.setup !== "") out.setup = raw.setup;
  if (isNumber(raw.timeout)) out.timeout = raw.timeout;
  return out;
};

/**
 * Render a TypeScript eval file from validated cases. The wrapper is
 * fixed — skillet provides describeEval, judges, and the harness, so
 * the LLM only contributes the case list.
 */
const renderEvalFile = (cases: RawCase[]): string => {
  const dataLines: string[] = [];
  for (const c of cases) {
    const obj: string[] = [];
    obj.push(`    name: ${JSON.stringify(c.name)}`);
    if (c.tests_behavior != null) {
      obj.push(`    tests_behavior: ${JSON.stringify(c.tests_behavior)}`);
    }
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

describeEval("evals", {
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
 * Run the eval-gen phase: SkillSpec → TypeScript eval file content.
 *
 * Asks the LLM for a JSON array of cases (one per behavior/must_not),
 * validates each, then wraps the array in a fixed TypeScript template.
 * The wrapper handles imports, harness instantiation, and judges so
 * the LLM never produces malformed boilerplate.
 */
export const runEvalGen = async (
  model: AnyModel,
  spec: SkillSpec,
  opts: { logProgress?: ((msg: string) => void) | undefined } = {},
): Promise<string> => {
  const log = opts.logProgress;
  log?.(`eval-gen: ${spec.behaviors.length} behavior(s), ${spec.must_not.length} must_not(s)`);

  const input = {
    behaviors: spec.behaviors.map((b) => ({
      id: b.id,
      statement: b.statement,
      rationale: b.rationale,
    })),
    must_not: spec.must_not.map((m: MustNot) => ({
      id: m.id,
      statement: m.statement,
      rationale: m.rationale,
      leakage_risk: m.leakage_risk,
    })),
  };

  const userContent = `Generate eval cases for the following spec entries:\n\n\`\`\`json\n${JSON.stringify(input, null, 2)}\n\`\`\``;

  const context: Context = {
    systemPrompt: buildEvalGenPrompt(),
    messages: [{ role: "user", content: userContent, timestamp: Date.now() }],
  };

  // Up to 3 attempts: validate the LLM output and re-prompt with the
  // error if it's malformed.
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      log?.(`  retry ${attempt} (${lastError?.message ?? "unknown"})`);
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
      const cases = parsed.map((raw, i) => validateCase(raw, i));
      log?.(`  produced ${cases.length} case(s)`);
      return renderEvalFile(cases);
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      continue;
    }
  }

  throw new Error(`eval-gen: failed after 3 attempts. Last error: ${lastError?.message}`);
};
