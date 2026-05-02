import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
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
import { consolidate, type ConsolidationResult } from "./eval-gen-consolidate.js";
import { applyPlanEdits, PlanEditError } from "./eval-gen-edits.js";
import { RenderError, renderEvalFile, renderJudgesFile, validatePlan } from "./eval-gen-render.js";
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
    if (isRecord(c.fixture)) {
      const fixture: Record<string, string> = {};
      for (const [path, content] of Object.entries(c.fixture)) {
        if (isString(content)) fixture[path] = content;
      }
      if (Object.keys(fixture).length > 0) casePlan.fixture = fixture;
    }
    if (isString(c.setup) && c.setup !== "") casePlan.setup = c.setup;
    if (isNumber(c.timeout)) casePlan.timeout = c.timeout;
    cases.push(casePlan);
  }

  return { judges, cases };
};

/**
 * Pre-flight any per-case `fixture` or `setup` shells in a temp
 * workspace to catch failed scripts, missing directories, or bad
 * heredocs before the eval file is written.
 *
 * For `fixture` (file map), we synthesize a single shell heredoc
 * that writes each entry, then run it through createWorkspace —
 * the same path used by `harness.useFixture` at runtime, so we
 * fail fast on bad fixture content (e.g. a heredoc terminator
 * inside the YAML).
 */
const validateCaseFixtures = (cases: CasePlan[]): void => {
  for (const c of cases) {
    if (c.fixture != null && Object.keys(c.fixture).length > 0) {
      const script = fixtureMapToShell(c.fixture);
      const workspace = createWorkspace({ setup: script });
      workspace.cleanup();
    } else if (c.setup != null && c.setup !== "") {
      const workspace = createWorkspace({ setup: c.setup });
      workspace.cleanup();
    }
  }
};

const fixtureMapToShell = (fixture: Record<string, string>): string => {
  const lines: string[] = [];
  for (const [relPath, content] of Object.entries(fixture)) {
    const dir = dirname(relPath);
    if (dir !== "" && dir !== ".") {
      lines.push(`mkdir -p ${shellQuote(dir)}`);
    }
    lines.push(`cat > ${shellQuote(relPath)} <<'__SKILLET_EOF__'`);
    lines.push(content);
    lines.push(`__SKILLET_EOF__`);
  }
  return lines.join("\n");
};

const shellQuote = (s: string): string => `'${s.replace(/'/g, "'\\''")}'`;

interface SingleEntryInput {
  entry: Behavior | MustNot;
  kind: "behavior" | "must_not";
  mustNotRules: Array<{ id: string; statement: string }>;
}

/**
 * **Stage 2: Generate.** Issue ONE LLM call for a single spec
 * entry, retrying on parse/validation failure. Returns a
 * validated `AssertionPlan` (no rendering — that happens after
 * consolidation).
 */
const generateForEntry = async (
  model: AnyModel,
  input: SingleEntryInput,
  signal: AbortSignal,
): Promise<AssertionPlan> => {
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
      validateCaseFixtures(plan.cases);
      // Contract caps (≤5 judges, banned kinds, criterion length,
      // referenced judges, etc.) — fail fast on contract violations
      // so the LLM can fix the plan within MAX_ATTEMPTS_PER_ENTRY.
      validatePlan(input.entry.id, plan);
    } catch (err: unknown) {
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
      event("warn", `eval-gen behavior=${input.entry.id} attempt=${attempt} validate-fail`, {
        message: lastError.message,
        retriesRemaining: remaining,
        savedTo: saved.path,
      });
      continue;
    }

    return plan;
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
    // oxlint-disable-next-line no-unsafe-type-assertion
    edits.push(e as unknown as PlanEdit);
  }
  return { approve: false, edits };
};

/**
 * Apply the verifier's edits to the plan. If the applier or
 * post-edit validation throws, return the original plan with a
 * warning so the user can audit.
 */
const applyEditsSafely = (
  entryId: string,
  originalPlan: AssertionPlan,
  edits: PlanEdit[],
): { plan: AssertionPlan; usedEdits: boolean } => {
  if (edits.length === 0) return { plan: originalPlan, usedEdits: false };
  try {
    const editedPlan = applyPlanEdits(originalPlan, edits);
    validateCaseFixtures(editedPlan.cases);
    validatePlan(entryId, editedPlan);
    event("info", `eval-gen-verify behavior=${entryId} edits-applied count=${edits.length}`);
    return { plan: editedPlan, usedEdits: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const tag = err instanceof PlanEditError ? "edit-failed" : "edit-validated-invalid";
    event("warn", `eval-gen-verify behavior=${entryId} ${tag}`, {
      message: msg,
      editCount: edits.length,
    });
    return { plan: originalPlan, usedEdits: false };
  }
};

/**
 * Run the eval-gen phase: spec entries → one `.eval.ts` file per
 * behavior/must_not, plus a suite-wide `_judges.ts` and per-case
 * fixture trees under `evals/fixtures/`.
 *
 * **Per-entry stage (fan-out, parallel via AI queue)**:
 * 1. Generate plan (`eval-gen:<id>` job, parse-retry up to 3x)
 * 2. Verify plan (1 call, no loop)
 * 3. Apply edits if any
 *
 * **Per-skill stage (after all entries settle, no LLM)**:
 * 4. Consolidate plans — dedupe judges, extract fixtures
 * 5. Render and write `_judges.ts`, `fixtures/<slug>/`,
 *    `<entry-id>.eval.ts` for each entry
 *
 * Failures are isolated per-entry — a failure on entry X does not
 * abort Y and Z; the result surfaces { written, skipped, failed }.
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

  // Per-entry stage: collect (entryId, plan) pairs and failures.
  const collected: Array<{ entryId: string; plan: AssertionPlan }> = [];
  const failed: Array<{ id: string; error: string }> = [];

  const tasks = missing.map(({ entry, kind }) =>
    generateAndVerify(model, { entry, kind, mustNotRules }, collected, failed, log),
  );
  await Promise.all(tasks);

  if (collected.length === 0) {
    return { written: [], skipped, failed };
  }

  // Per-skill consolidation + write stage.
  const consolidation = consolidate(collected);
  emitConsolidationTelemetry(consolidation);

  const written = writeArtifacts(skillRoot, evalsDir, consolidation, log);

  return { written, skipped, failed };
};

const generateAndVerify = (
  model: AnyModel,
  input: SingleEntryInput,
  collected: Array<{ entryId: string; plan: AssertionPlan }>,
  failed: Array<{ id: string; error: string }>,
  log?: (msg: string) => void,
): Promise<void> => {
  return submitAiJob({
    name: `eval-gen:${input.entry.id}`,
    run: async (signal) => {
      const start = Date.now();
      try {
        const generated = await generateForEntry(model, input, signal);
        const verdict = await verifyPlan(model, input, generated, signal);

        let finalPlan = generated;
        let edited = false;
        if (verdict.approve) {
          event("info", `eval-gen-verify behavior=${input.entry.id} approve=true`);
        } else {
          const result = applyEditsSafely(input.entry.id, generated, verdict.edits);
          finalPlan = result.plan;
          edited = result.usedEdits;
          event(
            "info",
            `eval-gen-verify behavior=${input.entry.id} approve=false edits=${verdict.edits.length} applied=${edited}`,
          );
        }

        collected.push({ entryId: input.entry.id, plan: finalPlan });
        const elapsed = Date.now() - start;
        event(
          "info",
          `eval-gen behavior=${input.entry.id} ok=true cases=${finalPlan.cases.length} judges=${finalPlan.judges.length} edited=${edited} (${elapsed}ms)`,
        );
        log?.(`  planned ${input.entry.id}${edited ? " (post-verify edits applied)" : ""}`);
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

const emitConsolidationTelemetry = (c: ConsolidationResult): void => {
  event(
    "info",
    `eval-gen-consolidate declared=${c.totalDeclared} canonical=${c.judges.length} fixtures=${Object.keys(c.fixtures).length}`,
  );
  for (const conflict of c.conflicts) {
    event("warn", `eval-gen-consolidate conflict judge=${conflict.judgeName}`, {
      criteria: conflict.criteria,
      entryIds: conflict.entryIds,
    });
  }
};

/**
 * Per-skill render + write stage. Writes (in order):
 *   1. evals/_judges.ts (one per skill)
 *   2. evals/fixtures/<slug>/<rel-path> (one tree per case with a fixture)
 *   3. evals/<entry-id>.eval.ts (one per consolidated entry)
 *
 * Returns the list of `.eval.ts` paths written.
 */
const writeArtifacts = (
  skillRoot: string,
  evalsDir: string,
  consolidation: ConsolidationResult,
  log?: (msg: string) => void,
): string[] => {
  const judgesPath = join(evalsDir, "_judges.ts");
  writeFileSync(judgesPath, renderJudgesFile(consolidation.judges), "utf-8");
  log?.(`  wrote ${judgesPath} (${consolidation.judges.length} canonical judges)`);

  for (const [caseSlug, fileMap] of Object.entries(consolidation.fixtures)) {
    writeFixtureTree(skillRoot, caseSlug, fileMap);
  }
  if (Object.keys(consolidation.fixtures).length > 0) {
    log?.(
      `  wrote ${Object.keys(consolidation.fixtures).length} fixture tree(s) under evals/fixtures/`,
    );
  }

  const written: string[] = [];
  for (const { entryId, plan } of consolidation.perEntry) {
    const filePath = join(evalsDir, `${entryId}.eval.ts`);
    const rendered = renderEvalFile(entryId, plan, consolidation.judges);
    writeFileSync(filePath, rendered, "utf-8");
    written.push(filePath);
    log?.(`  wrote ${filePath}`);
  }
  return written;
};

const writeFixtureTree = (
  skillRoot: string,
  caseSlug: string,
  files: Record<string, string>,
): void => {
  const root = join(skillRoot, "evals", "fixtures", caseSlug);
  for (const [relPath, content] of Object.entries(files)) {
    const full = join(root, relPath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content, "utf-8");
  }
};
