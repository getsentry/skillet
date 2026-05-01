import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Context } from "@mariozechner/pi-ai";
import { completeWithBackoff } from "../../agent/complete-with-backoff.js";
import type { AnyModel } from "../../agent/provider.js";
import { submitAiJob } from "../../agent/queue.js";
import { createWorkspace } from "../../eval/workspace.js";
import { event } from "../../log.js";
import type { Behavior, MustNot, SkillSpec } from "../../spec/index.js";
import { buildEvalGenPrompt } from "../prompts/eval-gen.js";
import { saveFailedOutput } from "./_diagnostics.js";
import { extractText, isRecord, stripFences } from "./_text.js";
import type { AssertionPlan, CasePlan, JudgePlan } from "./eval-gen-types.js";
import { renderEvalFile, RenderError } from "./eval-gen-render.js";

export { EVAL_TS_BANNER } from "./eval-gen-render.js";

export interface RunEvalGenResult {
  /** Files written this run (new behavior IDs only). */
  written: string[];
  /** Behavior IDs whose eval file already existed and was preserved. */
  skipped: string[];
  /** Behavior IDs whose generation failed after retries. */
  failed: Array<{ id: string; error: string }>;
}

/** Maximum retries per behavior on parse/validation failure. */
const MAX_ATTEMPTS_PER_ENTRY = 3;

const isString = (v: unknown): v is string => typeof v === "string";
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Validate the LLM-returned JSON conforms to the AssertionPlan
 * shape. The renderer applies semantic guardrails on top
 * (suspicious patterns, unknown judge references); this function
 * is purely shape validation so we surface missing fields with
 * specific error messages the LLM can act on.
 */
const validatePlanShape = (raw: unknown, expectedId: string): AssertionPlan => {
  if (!isRecord(raw)) {
    throw new Error("response is not a JSON object");
  }
  if (!Array.isArray(raw.judges)) {
    throw new Error("plan.judges must be an array (use [] when no judges are needed)");
  }
  if (!Array.isArray(raw.cases) || raw.cases.length === 0) {
    throw new Error("plan.cases must be a non-empty array");
  }

  const judges: JudgePlan[] = [];
  for (const [i, j] of raw.judges.entries()) {
    if (!isRecord(j)) {
      throw new Error(`plan.judges[${i}]: not an object`);
    }
    if (!isString(j.name) || j.name === "") {
      throw new Error(`plan.judges[${i}]: missing 'name'`);
    }
    if (!isString(j.criterion) || j.criterion === "") {
      throw new Error(`plan.judges[${i}] (${j.name}): missing 'criterion'`);
    }
    judges.push({ name: j.name, criterion: j.criterion });
  }

  const cases: CasePlan[] = [];
  for (const [i, c] of raw.cases.entries()) {
    if (!isRecord(c)) {
      throw new Error(`plan.cases[${i}]: not an object`);
    }
    if (!isString(c.name) || c.name === "") {
      throw new Error(`plan.cases[${i}]: missing 'name'`);
    }
    if (!isString(c.tests_behavior) || c.tests_behavior === "") {
      throw new Error(`plan.cases[${i}] (${c.name}): missing 'tests_behavior'`);
    }
    if (c.tests_behavior !== expectedId) {
      throw new Error(
        `plan.cases[${i}] (${c.name}): tests_behavior '${c.tests_behavior}' does not match the requested entry '${expectedId}'`,
      );
    }
    if (!isString(c.input) || c.input === "") {
      throw new Error(`plan.cases[${i}] (${c.name}): missing 'input'`);
    }
    if (!Array.isArray(c.assertions) || c.assertions.length === 0) {
      throw new Error(`plan.cases[${i}] (${c.name}): assertions must be a non-empty array`);
    }
    const casePlan: CasePlan = {
      name: c.name,
      tests_behavior: c.tests_behavior,
      input: c.input,
      // oxlint-disable-next-line no-unsafe-type-assertion
      assertions: c.assertions as CasePlan["assertions"],
    };
    if (isString(c.setup) && c.setup !== "") casePlan.setup = c.setup;
    if (isNumber(c.timeout)) casePlan.timeout = c.timeout;
    cases.push(casePlan);
  }

  return { judges, cases };
};

/**
 * Pre-flight any per-case `setup` shell scripts in a temp workspace
 * to catch failed `git commit`, missing directories, or shell
 * syntax errors before the eval file is written.
 */
const validateCaseSetups = (cases: CasePlan[]): void => {
  for (const c of cases) {
    if (c.setup == null || c.setup === "") continue;
    const workspace = createWorkspace({ setup: c.setup });
    workspace.cleanup();
  }
};

interface SingleEntryInput {
  entry: Behavior | MustNot;
  kind: "behavior" | "must_not";
  mustNotRules: Array<{ id: string; statement: string }>;
}

/**
 * Issue ONE LLM call for a single spec entry, retrying on
 * parse/validation/render failure. Returns the validated plan. The
 * signal comes from the AI queue's per-job deadline and is forwarded
 * into every pi-ai call inside the parse-retry loop.
 */
const generateForEntry = async (
  model: AnyModel,
  input: SingleEntryInput,
  signal: AbortSignal,
): Promise<{ plan: AssertionPlan; rendered: string }> => {
  const userContent = `Generate the assertion plan for this single spec entry:\n\n\`\`\`json\n${JSON.stringify(
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
        content: `Your previous output failed validation: ${lastError?.message}\n\nReturn a valid JSON assertion plan — only the object, no prose, no fences.`,
        timestamp: Date.now(),
      });
    }
    event("debug", `eval-gen request behavior=${input.entry.id} attempt=${attempt}`, {
      prompt: userContent,
    });
    const response = await completeWithBackoff(model, context, { maxTokens: 4000, signal });
    context.messages.push(response);
    const text = extractText(response);
    event("debug", `eval-gen response behavior=${input.entry.id} attempt=${attempt}`, {
      response: text,
    });

    const remaining = MAX_ATTEMPTS_PER_ENTRY - attempt;

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripFences(text, "json"));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      lastError = new Error(`response was not valid JSON: ${msg}`);
      const saved = saveFailedOutput({
        phase: "eval-gen",
        key: input.entry.id,
        attempt,
        raw: text,
        errorMessage: lastError.message,
        kind: "parse",
      });
      event("warn", `eval-gen behavior=${input.entry.id} attempt=${attempt} parse-fail`, {
        message: lastError.message,
        retriesRemaining: remaining,
        savedTo: saved.path,
        responseHead: saved.excerpt,
      });
      continue;
    }

    let plan: AssertionPlan;
    try {
      plan = validatePlanShape(parsed, input.entry.id);
      validateCaseSetups(plan.cases);
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const saved = saveFailedOutput({
        phase: "eval-gen",
        key: input.entry.id,
        attempt,
        raw: text,
        errorMessage: lastError.message,
        kind: "schema",
      });
      event("warn", `eval-gen behavior=${input.entry.id} attempt=${attempt} validate-fail`, {
        message: lastError.message,
        retriesRemaining: remaining,
        savedTo: saved.path,
      });
      continue;
    }

    let rendered: string;
    try {
      rendered = renderEvalFile(input.entry.id, plan);
    } catch (err: unknown) {
      // Renderer guardrails (bare `/HIGH/`-style regex, unknown judge
      // refs, etc.) bubble up as RenderError. Treat them like a
      // schema failure so the LLM gets a chance to fix the plan.
      const rerr = err instanceof RenderError ? err : null;
      lastError = rerr ?? (err instanceof Error ? err : new Error(String(err)));
      const saved = saveFailedOutput({
        phase: "eval-gen",
        key: input.entry.id,
        attempt,
        raw: text,
        errorMessage: lastError.message,
        kind: "schema",
      });
      event("warn", `eval-gen behavior=${input.entry.id} attempt=${attempt} render-fail`, {
        message: lastError.message,
        retriesRemaining: remaining,
        savedTo: saved.path,
      });
      continue;
    }

    return { plan, rendered };
  }

  throw lastError ?? new Error("eval-gen: unknown failure");
};

/**
 * Run the eval-gen phase: spec entries → one `.eval.ts` file per
 * behavior/must_not.
 *
 * Each missing entry submits one job to the AI queue. Parallelism is
 * the queue's concurrency cap (`--ai-concurrency`). Failures are
 * isolated per-entry — a failure on entry X does not abort Y and Z;
 * the result surfaces { written, skipped, failed } so the caller can
 * decide whether partial success is acceptable.
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
  });

  if (missing.length === 0) {
    return { written: [], skipped, failed: [] };
  }

  mkdirSync(evalsDir, { recursive: true });
  const written: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];

  const tasks = missing.map(({ entry, kind }) =>
    submitAiJob({
      name: `eval-gen:${entry.id}`,
      run: async (signal) => {
        const start = Date.now();
        try {
          const { plan, rendered } = await generateForEntry(
            model,
            { entry, kind, mustNotRules },
            signal,
          );
          const filePath = join(evalsDir, `${entry.id}.eval.ts`);
          writeFileSync(filePath, rendered, "utf-8");
          const elapsed = Date.now() - start;
          written.push(filePath);
          event(
            "info",
            `eval-gen behavior=${entry.id} ok=true cases=${plan.cases.length} judges=${plan.judges.length} (${elapsed}ms)`,
          );
          log?.(`  wrote ${filePath}`);
        } catch (err: unknown) {
          const elapsed = Date.now() - start;
          const msg = err instanceof Error ? err.message : String(err);
          failed.push({ id: entry.id, error: msg });
          event("error", `eval-gen behavior=${entry.id} ok=false (${elapsed}ms): ${msg}`);
          log?.(`  failed ${entry.id}: ${msg}`);
        }
      },
    }),
  );

  await Promise.all(tasks);

  return { written, skipped, failed };
};
