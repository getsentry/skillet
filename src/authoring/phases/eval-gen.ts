import { stringify as stringifyYaml } from "yaml";
import type { AnyModel } from "../../agent/provider.js";
import { slugify } from "../../spec/index.js";
import type { Behavior, BehaviorEval, MustNot, SkillSpec } from "../../spec/index.js";
import { generateEvalYamlWithRetry } from "../eval-gen.js";
import { buildEvalGenPrompt } from "../prompts/eval-gen.js";

/**
 * The derived banner placed at the top of each generated eval YAML.
 * Points readers at spec.yaml as the source of truth.
 *
 * Eval cases come from two places:
 * - Behaviors with a complete \`eval\` block in spec.yaml render
 *   their case mechanically — those are stable across regens.
 * - Behaviors without an \`eval\` block get an LLM-invented case here.
 *   When that case passes under improve, it's promoted back into the
 *   spec's eval block so subsequent regens are deterministic.
 *
 * Hand edits to this file are NOT preserved. Edit spec.yaml's
 * behavior eval blocks if you want a specific test shape locked in.
 */
export const EVAL_YAML_BANNER = `# ──────────────────────────────────────────────────────────
# Generated from spec.yaml. To lock in a specific test shape, put
# the prompt + expect/criteria into the behavior's \`eval\` block in
# spec.yaml — those render mechanically and survive regens. Hand
# edits to this file are overwritten on the next regen.
# ──────────────────────────────────────────────────────────
`;

const PROMPT_SLUG_MAX = 30;

const isCompleteEval = (e: BehaviorEval | undefined): e is BehaviorEval => {
  if (e == null) return false;
  if (typeof e.prompt !== "string" || e.prompt.trim() === "") return false;
  const hasExpect = typeof e.expect === "string" && e.expect.length > 0;
  const hasCriteria = typeof e.criteria === "string" && e.criteria.length > 0;
  return hasExpect || hasCriteria;
};

/**
 * Render an eval case mechanically from a spec entry's id + a known-
 * complete eval block. This deterministic path avoids round-tripping
 * fully-specified cases through the LLM, which used to corrupt good
 * eval blocks (especially must_not entries with `criteria`, which the
 * LLM tended to reshape into file-based negative checks that fail the
 * `vacuous-negative-without-positive` lint).
 *
 * Caller is expected to have verified `eval` via `isCompleteEval`
 * before invoking — that's why the function takes the unwrapped
 * `BehaviorEval` rather than the full entry.
 */
const renderCaseFromSpec = (
  id: string,
  e: BehaviorEval,
  kind: "behavior" | "must_not",
): Record<string, unknown> => {
  const promptSlug = slugify(e.prompt, 0).slice(0, PROMPT_SLUG_MAX);
  const caseName = `${id}__${promptSlug !== "" ? promptSlug : "case"}`;

  const out: Record<string, unknown> = {
    name: caseName,
    tests_behavior: id,
    turns: [e.prompt],
  };
  if (e.setup != null) {
    out.workspace = { setup: e.setup };
  }
  if (e.expect != null) {
    out.checks = [{ output_contains: e.expect }];
  } else if (e.criteria != null) {
    out.criteria = e.criteria;
  }
  // Negative cases (must_not) almost always need the LLM judge; they
  // also tend to be quick output-only checks. Set conservative timeouts
  // so the eval runner doesn't sit on a flake forever.
  out.timeout = kind === "must_not" || e.criteria != null ? 30000 : 60000;
  return out;
};

const renderEvalsHeader = (cases: Array<Record<string, unknown>>): string => {
  return stringifyYaml({ evals: cases }, { lineWidth: 0 });
};

/**
 * Run the eval-gen phase: SkillSpec.behaviors + must_not → eval YAML.
 *
 * Two-path strategy:
 *
 * - Spec entries with a complete `eval` block (prompt + expect/criteria)
 *   are rendered mechanically. No LLM, no lint loop. This avoids the
 *   model corrupting fully-specified cases — particularly must_not
 *   entries with `criteria`, which the LLM used to reshape into
 *   file-based negative checks that fail the
 *   `vacuous-negative-without-positive` lint.
 * - Spec entries WITHOUT an eval block are passed to the LLM, which
 *   invents a case shape from the statement. This goes through the
 *   existing lint+retry loop.
 *
 * The two halves are merged into a single eval YAML in spec order
 * (behaviors first, then must_nots).
 *
 * Returns the YAML string; the caller prepends `EVAL_YAML_BANNER` if
 * desired.
 */
export const runEvalGen = async (
  model: AnyModel,
  spec: SkillSpec,
  opts: { logProgress?: ((msg: string) => void) | undefined } = {},
): Promise<string> => {
  const log = opts.logProgress;

  // Partition by whether the spec already supplies a complete eval block.
  const renderedCases: Array<Record<string, unknown>> = [];
  const llmEntries: Array<{ entry: Behavior | MustNot; kind: "behavior" | "must_not" }> = [];

  for (const b of spec.behaviors) {
    if (isCompleteEval(b.eval)) {
      renderedCases.push(renderCaseFromSpec(b.id, b.eval, "behavior"));
    } else {
      llmEntries.push({ entry: b, kind: "behavior" });
    }
  }
  for (const m of spec.must_not) {
    if (isCompleteEval(m.eval)) {
      renderedCases.push(renderCaseFromSpec(m.id, m.eval, "must_not"));
    } else {
      llmEntries.push({ entry: m, kind: "must_not" });
    }
  }

  log?.(
    `eval-gen: ${renderedCases.length} mechanically rendered, ${llmEntries.length} LLM-generated`,
  );

  // If everything was specified, skip the LLM entirely.
  if (llmEntries.length === 0) {
    return renderEvalsHeader(renderedCases);
  }

  // For the LLM half, only send the entries it actually needs to
  // invent cases for. This both shrinks the prompt and prevents the
  // LLM from re-emitting cases we already have.
  const input = {
    behaviors: llmEntries
      .filter((x) => x.kind === "behavior")
      .map(({ entry }) => ({
        id: entry.id,
        statement: entry.statement,
        rationale: entry.rationale,
      })),
    must_not: llmEntries
      .filter((x) => x.kind === "must_not")
      .map(({ entry }) => {
        const m = entry as MustNot;
        return {
          id: m.id,
          statement: m.statement,
          rationale: m.rationale,
          leakage_risk: m.leakage_risk,
        };
      }),
  };

  const userContent = `Generate eval cases for the following spec entries (no eval blocks were supplied — invent realistic ones):\n\n\`\`\`json\n${JSON.stringify(input, null, 2)}\n\`\`\``;

  const llmYaml = await generateEvalYamlWithRetry({
    model,
    systemPrompt: buildEvalGenPrompt(),
    initialUserContent: userContent,
    ...(log != null ? { logProgress: log } : {}),
  });

  // If we have no mechanically rendered cases, return the LLM output as-is.
  if (renderedCases.length === 0) return llmYaml;

  // Otherwise merge: render the deterministic half, then strip the
  // `evals:` header from the LLM output and append.
  const headBlock = renderEvalsHeader(renderedCases).trimEnd();
  const llmTail = llmYaml.replace(/^evals:\s*\n/, "");
  return `${headBlock}\n${llmTail}`;
};
