// ──────────────────────────────────────────────────────────
// Generated initially from spec.yaml; durable after that. Edit
// freely to refine prompts, setup, and assertions for this
// behavior. Add or remove behaviors via spec.yaml — skillet only
// regenerates eval files for behaviors that don't have one yet.
// ──────────────────────────────────────────────────────────
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { expect } from "vitest";
import {
  describeEval,
  piAiHarness,
  skilletAgent,
  skilletTools,
} from "@sentry/skillet/evals";
import {
  DistinguishesEvalFilesAsDurableJudge,
  DoesNotRecommendHandEditingSkillMdJudge,
  DoesNotRecommendValidateJudge,
  IdentifiesSkillMdAsDerivedJudge,
  RecommendsSpecRefineJudge,
} from "./_judges.js";

const skillRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/evals$/, "");

describeEval(
  "explain-spec-as-source-of-truth",
  {
    harness: piAiHarness({
      createAgent: () => skilletAgent({ skillRoot }),
      tools: skilletTools({ skillRoot }),
    }),
    judgeThreshold: 0.75,
  },
  (it) => {
    it(
      "explain-spec-as-source-of-truth__edit-skill-md",
      { timeout: 90_000 },
      async ({ run }) => {
        const result = await run("I want to change how my skill behaves — should I just edit SKILL.md directly?");

        await expect(result).toSatisfyJudge(IdentifiesSkillMdAsDerivedJudge);
        await expect(result).toSatisfyJudge(RecommendsSpecRefineJudge);
        await expect(result).toSatisfyJudge(DoesNotRecommendHandEditingSkillMdJudge);
      },
    );

    it(
      "explain-spec-as-source-of-truth__edit-eval-file",
      { timeout: 90_000 },
      async ({ run }) => {
        const result = await run("Can I edit the generated eval files in evals/ directly to tweak the test assertions, or will they get overwritten like SKILL.md?");

        await expect(result).toSatisfyJudge(DistinguishesEvalFilesAsDurableJudge);
        await expect(result).toSatisfyJudge(IdentifiesSkillMdAsDerivedJudge);
        await expect(result).toSatisfyJudge(DoesNotRecommendValidateJudge);
      },
    );
  },
);
