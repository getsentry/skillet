import type { AnyModel } from "../../agent/provider.js";
import type { MustNot, SkillSpec } from "../../spec/index.js";
import { generateEvalYamlWithRetry } from "../eval-gen.js";
import { buildEvalGenPrompt } from "../prompts/eval-gen.js";

/**
 * Banner placed at the top of each generated eval file. Points
 * readers at spec.yaml as the source of intent — but the eval file
 * itself is the durable test artifact (committed to git, edited
 * directly when test details need to change).
 *
 * NOTE: this file currently still emits YAML. The vitest-evals
 * migration replaces this with a TypeScript template — see
 * openspec/changes/vitest-evals-migration/.
 */
export const EVAL_YAML_BANNER = `# ──────────────────────────────────────────────────────────
# Generated from spec.yaml. Eval cases test the behaviors defined
# there. Edit spec.yaml to add/remove behaviors; edit this file
# directly to refine specific test shapes.
# ──────────────────────────────────────────────────────────
`;

/**
 * Run the eval-gen phase: SkillSpec.behaviors + must_not → eval YAML.
 *
 * The spec captures intent (statements); this phase asks the LLM to
 * invent eval cases that exercise each behavior. The lint+retry loop
 * catches malformed YAML and brittle check shapes.
 */
export const runEvalGen = async (
  model: AnyModel,
  spec: SkillSpec,
  opts: { logProgress?: ((msg: string) => void) | undefined } = {},
): Promise<string> => {
  const log = opts.logProgress;
  log?.(
    `eval-gen: ${spec.behaviors.length} behavior(s), ${spec.must_not.length} must_not(s)`,
  );

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

  return generateEvalYamlWithRetry({
    model,
    systemPrompt: buildEvalGenPrompt(),
    initialUserContent: userContent,
    ...(log != null ? { logProgress: log } : {}),
  });
};
