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
  skilletHarness,
} from "@sentry/skillet/evals";
import {
  DistinguishesEvalFilesAsDurableJudge,
  DoesNotRecommendApiKeySetupJudge,
  DoesNotRecommendValidateJudge,
  IdentifiesSkillMdAsDerivedJudge,
  RecommendsSpecRefineJudge,
} from "./_judges.js";

const skillRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/evals$/, "");

describeEval(
  "explain-spec-as-source-of-truth",
  { harness: skilletHarness({ skill: skillRoot }), judgeThreshold: 0.75 },
  (it) => {
    it(
      "explain-spec-as-source-of-truth__edit-skill-md",
      { timeout: 90_000 },
      async ({ run }) => {
        const result = await run("I want to tweak the wording in my skill's SKILL.md to clarify a behavior — should I just edit SKILL.md directly? And can I edit the eval files in evals/ too?");

        await expect(result).toSatisfyJudge(IdentifiesSkillMdAsDerivedJudge);
        await expect(result).toSatisfyJudge(RecommendsSpecRefineJudge);
        await expect(result).toSatisfyJudge(DistinguishesEvalFilesAsDurableJudge);
        await expect(result).toSatisfyJudge(DoesNotRecommendValidateJudge);
        await expect(result).toSatisfyJudge(DoesNotRecommendApiKeySetupJudge);
      },
    );
  },
);
