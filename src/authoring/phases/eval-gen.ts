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
import { buildEvalGenVerifyPrompt } from "../prompts/eval-gen-verify.js";
import { saveFailedOutput } from "./_diagnostics.js";
import { extractText, isRecord, stripFences } from "./_text.js";
import { applyPlanEdits, PlanEditError } from "./eval-gen-edits.js";
import { renderEvalFile, RenderError } from "./eval-gen-render.js";
import type {
  AssertionPlan,
  CasePlan,
  JudgePlan,
  PlanEdit,
  VerifyVerdict,
} from "./eval-gen-types.js";

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
 * **Stage 2: Generate.** Issue ONE LLM call for a single spec
 * entry, retrying on parse/validation/render failure. Returns the
 * validated plan AND the rendered file (rendered here so the
 * renderer's contract caps act as part of the parse-retry loop).
 *
 * The signal comes from the AI queue's per-job deadline and is
 * forwarded into every pi-ai call inside the parse-retry loop.
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
      // Renderer guardrails (contract caps, suspicious regex,
      // unknown judge refs) bubble up as RenderError. Treat them
      // like a schema failure so the LLM gets a chance to fix the
      // plan.
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
 * **Stage 3: Verify.** Issue one LLM call asking a critic whether
 * the generator's plan honors the code-eval contract. Returns the
 * approve/edits verdict.
 *
 * Single-pass — no retry loop. Parse failures fall through to a
 * benign `{ approve: true }` so a flaky verifier doesn't tank the
 * file. The renderer's caps still bound what reaches disk.
 */
const verifyPlan = async (
  model: AnyModel,
  input: SingleEntryInput,
  plan: AssertionPlan,
  signal: AbortSignal,
): Promise<VerifyVerdict> => {
  const userContent = `Critic call. Spec entry + must_not list + the generator's plan are below. Decide: did the generator honor the code-eval contract? Return JSON.\n\n## Spec entry\n\n\`\`\`json\n${JSON.stringify(
    { kind: input.kind, entry: input.entry, must_not_rules: input.mustNotRules },
    null,
    2,
  )}\n\`\`\`\n\n## Plan\n\n\`\`\`json\n${JSON.stringify(plan, null, 2)}\n\`\`\``;

  const context: Context = {
    systemPrompt: buildEvalGenVerifyPrompt(),
    messages: [{ role: "user", content: userContent, timestamp: Date.now() }],
  };

  const response = await completeWithBackoff(model, context, { maxTokens: 4000, signal });
  const text = extractText(response);

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(text, "json"));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const saved = saveFailedOutput({
      phase: "eval-gen-verify",
      key: input.entry.id,
      attempt: 1,
      raw: text,
      errorMessage: `response was not valid JSON: ${msg}`,
      kind: "parse",
    });
    event("warn", `eval-gen-verify behavior=${input.entry.id} parse-fail`, {
      message: msg,
      savedTo: saved.path,
      responseHead: saved.excerpt,
    });
    return { approve: true };
  }

  const verdict = parseVerdict(parsed);
  if (verdict == null) {
    const saved = saveFailedOutput({
      phase: "eval-gen-verify",
      key: input.entry.id,
      attempt: 1,
      raw: text,
      errorMessage: "verdict shape is neither {approve:true} nor {approve:false, edits:[...]}",
      kind: "schema",
    });
    event("warn", `eval-gen-verify behavior=${input.entry.id} bad-shape`, {
      savedTo: saved.path,
    });
    return { approve: true };
  }
  return verdict;
};

const parseVerdict = (raw: unknown): VerifyVerdict | null => {
  if (!isRecord(raw)) return null;
  if (raw.approve === true) return { approve: true };
  if (raw.approve !== false) return null;
  if (!Array.isArray(raw.edits)) return null;
  const edits: PlanEdit[] = [];
  for (const e of raw.edits) {
    if (!isRecord(e)) return null;
    // Trust the shape — the applier will throw on missing
    // targets, unknown kinds, or out-of-range indices, and the
    // caller falls back to the original plan on PlanEditError.
    // oxlint-disable-next-line no-unsafe-type-assertion
    edits.push(e as unknown as PlanEdit);
  }
  return { approve: false, edits };
};

/**
 * **Stage 4: Apply edits + render.** When the verifier returned
 * edits, try applying them to the plan and re-rendering. If the
 * applier throws OR the resulting plan fails the renderer's caps,
 * fall back to the unedited plan's render and log a warning so
 * the user can audit verifier quality.
 */
const applyEditsSafely = (
  entryId: string,
  originalPlan: AssertionPlan,
  edits: PlanEdit[],
  fallbackRendered: string,
): { rendered: string; usedEdits: boolean } => {
  if (edits.length === 0) return { rendered: fallbackRendered, usedEdits: false };
  try {
    const editedPlan = applyPlanEdits(originalPlan, edits);
    validateCaseSetups(editedPlan.cases);
    const rendered = renderEvalFile(entryId, editedPlan);
    event("info", `eval-gen-verify behavior=${entryId} edits-applied count=${edits.length}`);
    return { rendered, usedEdits: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const tag = err instanceof PlanEditError ? "edit-failed" : "edit-rendered-invalid";
    event("warn", `eval-gen-verify behavior=${entryId} ${tag}`, {
      message: msg,
      editCount: edits.length,
    });
    return { rendered: fallbackRendered, usedEdits: false };
  }
};

/**
 * Run the eval-gen phase: spec entries → one `.eval.ts` file per
 * behavior/must_not.
 *
 * **Per-entry flow: Request → Generate → Verify → Render.**
 *
 * 1. Request — both prompts embed the shared `CODE_EVAL_CONTRACT`.
 * 2. Generate — `generateForEntry` (parse-retry up to 3x).
 * 3. Verify — `verifyPlan` (1 call, no loop). Returns approve or
 *    plan edits.
 * 4. Render — if approve, write the original render. If edits,
 *    `applyEditsSafely` produces a new render or falls back.
 *
 * Each missing entry submits the generate + verify pair as separate
 * AI jobs (`eval-gen:<id>`, `eval-gen:verify:<id>`). The queue's
 * concurrency cap throttles total parallelism.
 *
 * Failures are isolated per-entry — a failure on entry X does not
 * abort Y and Z; the result surfaces { written, skipped, failed }
 * so the caller can decide whether partial success is acceptable.
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
    generateAndWrite(
      model,
      evalsDir,
      {
        entry,
        kind,
        mustNotRules,
      },
      written,
      failed,
      log,
    ),
  );

  await Promise.all(tasks);

  return { written, skipped, failed };
};

/**
 * Per-entry pipeline submitted as one AI job (the verify call is
 * a separate sub-job inside it). Captures success / failure into
 * the shared `written` and `failed` arrays.
 */
const generateAndWrite = (
  model: AnyModel,
  evalsDir: string,
  input: SingleEntryInput,
  written: string[],
  failed: Array<{ id: string; error: string }>,
  log?: (msg: string) => void,
): Promise<void> => {
  return submitAiJob({
    name: `eval-gen:${input.entry.id}`,
    run: async (signal) => {
      const start = Date.now();
      try {
        // ── Generate ───────────────────────────────────
        const { plan, rendered: originalRender } = await generateForEntry(model, input, signal);

        // ── Verify ─────────────────────────────────────
        // Called directly inside the outer eval-gen job — re-entering
        // the queue here would deadlock when concurrency is fully
        // saturated with generate jobs, each blocked on a verify
        // slot. The outer slot already covers both calls.
        const verdict = await verifyPlan(model, input, plan, signal);

        let rendered: string;
        let edited = false;
        if (verdict.approve) {
          rendered = originalRender;
          event("info", `eval-gen-verify behavior=${input.entry.id} approve=true`);
        } else {
          const result = applyEditsSafely(input.entry.id, plan, verdict.edits, originalRender);
          rendered = result.rendered;
          edited = result.usedEdits;
          event(
            "info",
            `eval-gen-verify behavior=${input.entry.id} approve=false edits=${verdict.edits.length} applied=${edited}`,
          );
        }

        const filePath = join(evalsDir, `${input.entry.id}.eval.ts`);
        writeFileSync(filePath, rendered, "utf-8");
        const elapsed = Date.now() - start;
        written.push(filePath);
        event(
          "info",
          `eval-gen behavior=${input.entry.id} ok=true cases=${plan.cases.length} judges=${plan.judges.length} edited=${edited} (${elapsed}ms)`,
        );
        log?.(`  wrote ${filePath}${edited ? " (post-verify edits applied)" : ""}`);
      } catch (err: unknown) {
        const elapsed = Date.now() - start;
        const msg = err instanceof Error ? err.message : String(err);
        failed.push({ id: input.entry.id, error: msg });
        event("error", `eval-gen behavior=${input.entry.id} ok=false (${elapsed}ms): ${msg}`);
        log?.(`  failed ${input.entry.id}: ${msg}`);
      }
    },
  });
};
