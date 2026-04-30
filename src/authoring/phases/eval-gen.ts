import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Context } from "@mariozechner/pi-ai";
import { completeWithBackoff } from "../../agent/complete-with-backoff.js";
import type { AnyModel } from "../../agent/provider.js";
import { createWorkspace } from "../../eval/workspace.js";
import { event } from "../../log.js";
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
  /** Behavior IDs whose generation failed after retries. */
  failed: Array<{ id: string; error: string }>;
}

/** Maximum concurrent per-behavior LLM calls. */
const DEFAULT_GEN_CONCURRENCY = 6;
/** Maximum retries per behavior on parse/validation failure. */
const MAX_ATTEMPTS_PER_ENTRY = 3;

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

const validateCase = (raw: unknown, index: number, expectedId: string): RawCase => {
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
  if (raw.tests_behavior !== expectedId) {
    throw new Error(
      `case ${index} (${raw.name}): tests_behavior '${raw.tests_behavior}' does not match the requested entry '${expectedId}'`,
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

const validateCaseSetup = (c: RawCase): void => {
  if (c.setup == null || c.setup === "") return;
  const workspace = createWorkspace({ setup: c.setup });
  workspace.cleanup();
};

const validateGeneratedCases = (cases: RawCase[]): RawCase[] => {
  for (const c of cases) {
    validateCaseSetup(c);
  }
  return cases;
};

/**
 * Render one behavior's eval file. The describeEval suite name is
 * the entry id so vitest's reporter groups output by behavior.
 */
const renderEvalFile = (entryId: string, cases: RawCase[]): string => {
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

describeEval(${JSON.stringify(entryId)}, {
  data: [
${dataLines.join("\n")}
  ],
  harness: skilletHarness({ skill: skillRoot }),
  judges: [SubstringJudge(), CriterionJudge()],
  threshold: 0.75,
  timeout: 180_000,
});
`;
};

interface SingleEntryInput {
  entry: Behavior | MustNot;
  kind: "behavior" | "must_not";
  mustNotRules: Array<{ id: string; statement: string }>;
}

/**
 * Issue ONE LLM call for a single spec entry, retrying on
 * parse/validation failure. Returns the parsed cases.
 */
const generateForEntry = async (model: AnyModel, input: SingleEntryInput): Promise<RawCase[]> => {
  const userContent = `Generate eval case(s) for this single spec entry:\n\n\`\`\`json\n${JSON.stringify(
    {
      kind: input.kind,
      entry: input.entry,
      must_not_rules: input.mustNotRules,
    },
    null,
    2,
  )}\n\`\`\``;

  const context: Context = {
    systemPrompt: buildEvalGenPrompt(),
    messages: [{ role: "user", content: userContent, timestamp: Date.now() }],
  };

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_ENTRY; attempt++) {
    if (attempt > 1) {
      context.messages.push({
        role: "user",
        content: `Your previous output failed validation: ${lastError?.message}\n\nReturn a valid JSON array of cases — only the array, no prose, no fences.`,
        timestamp: Date.now(),
      });
    }
    event("debug", `eval-gen request behavior=${input.entry.id} attempt=${attempt}`, {
      prompt: userContent,
    });
    const response = await completeWithBackoff(model, context, { maxTokens: 4000 });
    context.messages.push(response);
    const text = extractText(response);
    event("debug", `eval-gen response behavior=${input.entry.id} attempt=${attempt}`, {
      response: text,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripFences(text, "json"));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      lastError = new Error(`response was not valid JSON: ${msg}`);
      event("warn", `eval-gen behavior=${input.entry.id} attempt=${attempt} parse-fail`, {
        message: lastError.message,
        responseHead: text.slice(0, 200),
      });
      continue;
    }
    if (!Array.isArray(parsed)) {
      lastError = new Error("response was JSON but not an array");
      event("warn", `eval-gen behavior=${input.entry.id} attempt=${attempt} not-array`, {
        responseHead: text.slice(0, 200),
      });
      continue;
    }
    if (parsed.length === 0) {
      lastError = new Error("response array was empty");
      event("warn", `eval-gen behavior=${input.entry.id} attempt=${attempt} empty-array`);
      continue;
    }
    try {
      const cases = parsed.map((raw, i) => validateCase(raw, i, input.entry.id));
      return validateGeneratedCases(cases);
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      event("warn", `eval-gen behavior=${input.entry.id} attempt=${attempt} validate-fail`, {
        message: lastError.message,
      });
      continue;
    }
  }

  throw lastError ?? new Error("eval-gen: unknown failure");
};

/**
 * Run a list of async functions with a max concurrency cap. Lighter
 * weight than pulling in p-limit; we have one caller and a known shape.
 */
const runWithConcurrency = async <T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
): Promise<T[]> => {
  const results: T[] = Array.from({ length: tasks.length });
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const i = nextIndex;
      nextIndex += 1;
      if (i >= tasks.length) break;
      const task = tasks[i];
      if (task == null) break;
      results[i] = await task();
    }
  };
  const workers: Array<Promise<void>> = [];
  for (let i = 0; i < Math.min(concurrency, tasks.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
};

/**
 * Run the eval-gen phase: spec entries → one `.eval.ts` file per
 * behavior/must_not.
 *
 * Each missing entry gets its own LLM call, run in parallel up to
 * `DEFAULT_GEN_CONCURRENCY`. Calls are retried independently. A
 * failure on entry X does not abort entries Y and Z; the result
 * surfaces { written, skipped, failed } so the caller can decide
 * whether partial success is acceptable.
 *
 * Existing eval files are PRESERVED. Edit them directly to refine
 * prompts/setup/assertions; regen leaves them alone.
 */
export const runEvalGen = async (
  model: AnyModel,
  spec: SkillSpec,
  skillRoot: string,
  opts: { logProgress?: ((msg: string) => void) | undefined } = {},
): Promise<RunEvalGenResult> => {
  const log = opts.logProgress;
  const evalsDir = join(skillRoot, "evals");

  const entries: Array<{ entry: Behavior | MustNot; kind: "behavior" | "must_not" }> = [
    ...spec.behaviors.map((b) => ({ entry: b, kind: "behavior" as const })),
    ...spec.must_not.map((m) => ({ entry: m, kind: "must_not" as const })),
  ];
  const mustNotRules = spec.must_not.map((m) => ({ id: m.id, statement: m.statement }));

  const skipped: string[] = [];
  const missing: typeof entries = [];
  for (const e of entries) {
    const filePath = join(evalsDir, `${e.entry.id}.eval.ts`);
    if (existsSync(filePath)) {
      skipped.push(e.entry.id);
    } else {
      missing.push(e);
    }
  }

  log?.(`eval-gen: ${missing.length} new file(s) to generate, ${skipped.length} preserved`);
  event("info", `eval-gen plan`, {
    missing: missing.map((m) => m.entry.id),
    skipped,
    concurrency: DEFAULT_GEN_CONCURRENCY,
  });

  if (missing.length === 0) {
    return { written: [], skipped, failed: [] };
  }

  mkdirSync(evalsDir, { recursive: true });
  const written: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];

  // One task per missing entry — independent LLM call, retries
  // isolated to that entry. Successful files are written immediately
  // so a downstream failure leaves N-k files persisted with k pending.
  const tasks = missing.map(({ entry, kind }) => async (): Promise<void> => {
    const start = Date.now();
    try {
      const cases = await generateForEntry(model, { entry, kind, mustNotRules });
      const filePath = join(evalsDir, `${entry.id}.eval.ts`);
      writeFileSync(filePath, renderEvalFile(entry.id, cases), "utf-8");
      const elapsed = Date.now() - start;
      written.push(filePath);
      event("info", `eval-gen behavior=${entry.id} ok=true cases=${cases.length} (${elapsed}ms)`);
      log?.(`  wrote ${filePath}`);
    } catch (err: unknown) {
      const elapsed = Date.now() - start;
      const msg = err instanceof Error ? err.message : String(err);
      failed.push({ id: entry.id, error: msg });
      event("error", `eval-gen behavior=${entry.id} ok=false (${elapsed}ms): ${msg}`);
      log?.(`  failed ${entry.id}: ${msg}`);
    }
  });

  await runWithConcurrency(tasks, DEFAULT_GEN_CONCURRENCY);

  return { written, skipped, failed };
};
