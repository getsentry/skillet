/**
 * Render a validated `AssertionPlan` to TypeScript that uses the
 * harness-first `describeEval(name, { harness }, (it) => {...})`
 * callback form.
 *
 * Pure function: same plan in → same string out, no I/O. Lives apart
 * from `eval-gen.ts` so it's unit-testable in isolation.
 *
 * The renderer also enforces guardrails on suspicious deterministic
 * patterns (bare uppercase tokens without word boundaries, regex
 * that matches the case's own input verbatim) and bubbles them back
 * as `RenderError` so eval-gen can re-prompt with the diagnostic
 * instead of writing a flaky file to disk.
 */

import type {
  Assertion,
  AssertionPlan,
  CasePlan,
  JudgeAssertion,
  JudgePlan,
  OutputMatchObjectAssertion,
  ToolCallExpectation,
  ToolCallsAssertion,
} from "./eval-gen-types.js";

/** Banner placed at the top of generated eval files. */
export const EVAL_TS_BANNER = `// ──────────────────────────────────────────────────────────
// Generated initially from spec.yaml; durable after that. Edit
// freely to refine prompts, setup, and assertions for this
// behavior. Add or remove behaviors via spec.yaml — skillet only
// regenerates eval files for behaviors that don't have one yet.
// ──────────────────────────────────────────────────────────
`;

/**
 * Thrown when the plan violates a renderer guardrail. eval-gen
 * catches it and uses the message as the parse-equivalent retry
 * signal so the LLM can fix it.
 */
export class RenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RenderError";
  }
}

export interface RenderOptions {
  /** Indent string for nested blocks. Default `"  "` (two spaces). */
  indent?: string;
}

const DEFAULT_INDENT = "  ";

/** Pattern for a JS identifier (used to validate judge names). */
const JUDGE_NAME_RE = /^[A-Z][A-Za-z0-9]*Judge$/;

/**
 * Maximum chars in a judge `criterion`. The generator targets 200
 * (per the code-eval contract); the renderer's 300 absorbs minor
 * overruns the verifier didn't catch without blocking output.
 */
const MAX_CRITERION_CHARS = 300;

/** Per-file judge cap. The contract caps at 5; the renderer enforces it. */
const MAX_JUDGES_PER_FILE = 5;

/**
 * Banned assertion-kind names. The TypeScript type system removes
 * these from `Assertion`, but a verifier edit could still emit one
 * via a stringly-typed JSON kind. The renderer rejects them with a
 * migration message pointing at the recommended replacement.
 */
const BANNED_ASSERTION_KINDS = new Set([
  "output-matches",
  "output-contains",
  "output-not-contains",
]);

/**
 * Render an assertion plan to a complete `.eval.ts` file. Throws
 * `RenderError` on validation failures.
 */
export const renderEvalFile = (
  entryId: string,
  plan: AssertionPlan,
  options: RenderOptions = {},
): string => {
  validatePlan(entryId, plan);

  const indent = options.indent ?? DEFAULT_INDENT;
  const judgeNames = new Set(plan.judges.map((j) => j.name));

  const importLines = buildImports(plan, judgeNames);
  const judgeBlock = renderJudges(plan.judges);
  const describeEvalBlock = renderDescribeEval(entryId, plan.cases, indent);

  const judgesSection = judgeBlock === "" ? "" : `${judgeBlock}\n`;
  return `${EVAL_TS_BANNER}${importLines}

const skillRoot = dirname(fileURLToPath(import.meta.url)).replace(/\\/evals$/, "");
${judgesSection}
${describeEvalBlock}
`;
};

// ── Validation ─────────────────────────────────────────────────────────────

const validatePlan = (entryId: string, plan: AssertionPlan): void => {
  if (!Array.isArray(plan.cases) || plan.cases.length === 0) {
    throw new RenderError("plan.cases must be a non-empty array");
  }
  if (!Array.isArray(plan.judges)) {
    throw new RenderError("plan.judges must be an array (use [] for no judges)");
  }
  if (plan.judges.length > MAX_JUDGES_PER_FILE) {
    throw new RenderError(
      `plan declares ${plan.judges.length} judges (${plan.judges
        .map((j) => j.name)
        .join(
          ", ",
        )}); the code-eval contract allows at most ${MAX_JUDGES_PER_FILE} judges per file. Consolidate or drop the least-load-bearing.`,
    );
  }
  for (const judge of plan.judges) {
    if (!JUDGE_NAME_RE.test(judge.name)) {
      throw new RenderError(
        `judge name "${judge.name}" must be PascalCase ending in "Judge" (e.g. PwnRequestJudge)`,
      );
    }
    if (typeof judge.criterion !== "string" || judge.criterion.trim() === "") {
      throw new RenderError(`judge "${judge.name}": criterion must be a non-empty string`);
    }
    if (judge.criterion.length > MAX_CRITERION_CHARS) {
      throw new RenderError(
        `judge "${judge.name}": criterion is ${judge.criterion.length} chars (cap is ${MAX_CRITERION_CHARS}). Tighten the rubric to 1-2 sentences.`,
      );
    }
  }
  const judgeNames = new Set(plan.judges.map((j) => j.name));
  const referencedJudges = new Set<string>();
  const seenCaseNames = new Set<string>();
  for (const c of plan.cases) {
    if (typeof c.name !== "string" || c.name === "") {
      throw new RenderError("case missing 'name'");
    }
    if (seenCaseNames.has(c.name)) {
      throw new RenderError(`duplicate case name: "${c.name}"`);
    }
    seenCaseNames.add(c.name);
    if (c.tests_behavior !== entryId) {
      throw new RenderError(
        `case "${c.name}": tests_behavior "${c.tests_behavior}" does not match entry id "${entryId}"`,
      );
    }
    if (typeof c.input !== "string" || c.input === "") {
      throw new RenderError(`case "${c.name}": input must be a non-empty string`);
    }
    if (!Array.isArray(c.assertions) || c.assertions.length === 0) {
      throw new RenderError(`case "${c.name}": assertions must be a non-empty array`);
    }
    for (const a of c.assertions) {
      validateAssertion(c, a, judgeNames);
      if (a.kind === "judge") {
        referencedJudges.add(a.judgeName);
      }
    }
  }

  // Reject judges declared but never referenced — dead weight from
  // a verifier edit that didn't fully clean up, or a generator
  // mistake.
  for (const j of plan.judges) {
    if (!referencedJudges.has(j.name)) {
      throw new RenderError(
        `judge "${j.name}" is declared but never referenced. Remove it from plan.judges or wire it into a case's assertions.`,
      );
    }
  }
};

const validateAssertion = (caseData: CasePlan, a: Assertion, judgeNames: Set<string>): void => {
  // Defense in depth — TypeScript already removes the banned kinds
  // from `Assertion`, but a verifier edit could emit a banned kind
  // via a stringly-typed JSON shape. Reject with a migration message
  // pointing at the recommended replacement.
  // oxlint-disable-next-line no-unsafe-type-assertion
  const kindStr = (a as { kind: string }).kind;
  if (BANNED_ASSERTION_KINDS.has(kindStr)) {
    throw new RenderError(
      `case "${caseData.name}": assertion kind "${kindStr}" is banned. Free-form agent output (result.session.outputText) is not structurable enough for regex/string matching to be reliable. Replace with one of: a named LLM-rubric judge ({ kind: "judge", judgeName: "..." }), a structural output-match-object on result.output, or a tool-calls assertion.`,
    );
  }
  switch (a.kind) {
    case "output-match-object": {
      if (a.value == null || typeof a.value !== "object") {
        throw new RenderError(
          `case "${caseData.name}": output-match-object value must be an object`,
        );
      }
      return;
    }
    case "tool-calls": {
      validateToolCallsAssertion(caseData, a);
      return;
    }
    case "judge": {
      if (!judgeNames.has(a.judgeName)) {
        throw new RenderError(
          `case "${caseData.name}": judge assertion references unknown judge "${a.judgeName}"; declare it in plan.judges`,
        );
      }
      return;
    }
    default: {
      const exhaustive: never = a;
      throw new RenderError(`unknown assertion kind: ${JSON.stringify(exhaustive)}`);
    }
  }
};

const validateToolCallsAssertion = (caseData: CasePlan, a: ToolCallsAssertion): void => {
  const exp = a.expected;
  if (!Array.isArray(exp.names) || exp.names.length === 0) {
    throw new RenderError(
      `case "${caseData.name}": tool-calls.expected.names must be a non-empty array`,
    );
  }
  for (const n of exp.names) {
    if (typeof n !== "string" || n === "") {
      throw new RenderError(
        `case "${caseData.name}": tool-calls.expected.names entries must be non-empty strings`,
      );
    }
  }
};

// ── Imports ────────────────────────────────────────────────────────────────

const buildImports = (plan: AssertionPlan, _judgeNames: Set<string>): string => {
  const usesToolCalls = plan.cases.some((c) => c.assertions.some((a) => a.kind === "tool-calls"));
  const usesJudge = plan.judges.length > 0;

  const skilletNamed: string[] = ["describeEval", "skilletHarness"];
  if (usesJudge) skilletNamed.push("judge");
  if (usesToolCalls) skilletNamed.push("toolCalls");
  skilletNamed.sort();

  return [
    `import { fileURLToPath } from "node:url";`,
    `import { dirname } from "node:path";`,
    `import { expect } from "vitest";`,
    `import {`,
    ...skilletNamed.map((n) => `  ${n},`),
    `} from "@sentry/skillet/evals";`,
  ].join("\n");
};

// ── Judge declarations ─────────────────────────────────────────────────────

const renderJudges = (judges: JudgePlan[]): string => {
  if (judges.length === 0) return "";
  const blocks = judges.map((j) => {
    return `const ${j.name} = judge(${JSON.stringify(j.name)}, async ({ criterion }) => {
  return criterion(${JSON.stringify(j.criterion)});
});`;
  });
  return `\n${blocks.join("\n\n")}`;
};

// ── describeEval body ──────────────────────────────────────────────────────

const renderDescribeEval = (entryId: string, cases: CasePlan[], indent: string): string => {
  const lines: string[] = [];
  lines.push(`describeEval(`);
  lines.push(`${indent}${JSON.stringify(entryId)},`);
  lines.push(`${indent}{ harness: skilletHarness({ skill: skillRoot }) },`);
  lines.push(`${indent}(it) => {`);
  cases.forEach((c, i) => {
    if (i > 0) lines.push("");
    lines.push(...renderCase(c, indent + indent));
  });
  lines.push(`${indent}},`);
  lines.push(`);`);
  return lines.join("\n");
};

const renderCase = (c: CasePlan, indent: string): string[] => {
  const inner = indent + "  ";
  const body = inner + "  ";

  const usesSetup = c.setup != null && c.setup !== "";
  const fixtureFields = usesSetup ? "{ run, behavior, harness }" : "{ run, behavior }";

  const header: string[] = [];
  header.push(`${indent}it(`);
  header.push(`${inner}${JSON.stringify(c.name)},`);
  if (c.timeout != null) {
    header.push(`${inner}{ timeout: ${formatNumber(c.timeout)} },`);
  }
  header.push(`${inner}async (${fixtureFields}) => {`);

  const block: string[] = [];
  block.push(`${body}behavior(${JSON.stringify(c.tests_behavior)});`);
  if (usesSetup) {
    block.push(`${body}await harness.setup(${JSON.stringify(c.setup)});`);
  }
  block.push(`${body}const result = await run(${JSON.stringify(c.input)});`);
  block.push("");

  const usesToolCalls = c.assertions.some((a) => a.kind === "tool-calls");
  if (usesToolCalls) {
    block.push(`${body}const toolNames = toolCalls(result.session).map((c) => c.name);`);
  }

  for (const a of c.assertions) {
    block.push(...renderAssertion(a, body));
  }

  // Mark unused fixture properties — they're destructured but not
  // necessarily referenced by every test. Avoids the lint warning.
  // Intentionally not dropping them since they're often added by hand.

  return [...header, ...block, `${inner}},`, `${indent});`];
};

const renderAssertion = (a: Assertion, indent: string): string[] => {
  switch (a.kind) {
    case "output-match-object":
      return [renderOutputMatchObject(a, indent)];
    case "tool-calls":
      return renderToolCalls(a, indent);
    case "judge":
      return [renderJudgeAssertion(a, indent)];
    default: {
      // Exhaustiveness guard — TS already covers every variant via
      // the discriminant union, but oxlint wants an explicit branch.
      const exhaustive: never = a;
      throw new Error(`unknown assertion kind: ${JSON.stringify(exhaustive)}`);
    }
  }
};

const renderOutputMatchObject = (a: OutputMatchObjectAssertion, indent: string): string => {
  return `${indent}expect(result.output).toMatchObject(${JSON.stringify(a.value)});`;
};

const renderToolCalls = (a: ToolCallsAssertion, indent: string): string[] => {
  const exp: ToolCallExpectation = a.expected;
  switch (exp.type) {
    case "names-equal":
      return [`${indent}expect(toolNames).toEqual(${JSON.stringify(exp.names)});`];
    case "names-include":
      return [
        `${indent}expect(toolNames).toEqual(expect.arrayContaining(${JSON.stringify(exp.names)}));`,
      ];
    case "names-exclude":
      return exp.names.map(
        (n) => `${indent}expect(toolNames).not.toContain(${JSON.stringify(n)});`,
      );
    default: {
      const exhaustive: never = exp;
      throw new Error(`unknown tool-calls expectation: ${JSON.stringify(exhaustive)}`);
    }
  }
};

const renderJudgeAssertion = (a: JudgeAssertion, indent: string): string => {
  return `${indent}await expect(result).toSatisfyJudge(${a.judgeName});`;
};

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Format a number for use in generated TS. Adds `_000` separators
 * for large round numbers so the file reads naturally
 * (`180_000` instead of `180000`).
 */
const formatNumber = (n: number): string => {
  if (n % 1000 === 0 && n >= 1000) {
    const k = n / 1000;
    return `${k}_000`;
  }
  return String(n);
};
