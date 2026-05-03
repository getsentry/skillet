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
  DoesNotRecommendHandEditingSkillMdJudge,
  DoesNotRecommendValidateJudge,
  RecommendsAddEvalCommandJudge,
} from "./_judges.js";

const skillRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/evals$/, "");

describeEval(
  "choose-add-eval-for-named-behaviors",
  { harness: skilletHarness({ skill: skillRoot }), judgeThreshold: 0.75 },
  (it) => {
    it(
      "choose-add-eval-for-named-behaviors__single-behavior",
      { timeout: 90_000 },
      async ({ run }) => {
        const result = await run("I want to add an eval case for the behavior 'rejects empty input gracefully' in my skill. How do I do that?");

        await expect(result).toSatisfyJudge(RecommendsAddEvalCommandJudge);
        await expect(result).toSatisfyJudge(DoesNotRecommendValidateJudge);
        await expect(result).toSatisfyJudge(DoesNotRecommendHandEditingSkillMdJudge);
      },
    );

    it(
      "choose-add-eval-for-named-behaviors__multiple-behaviors",
      { timeout: 90_000 },
      async ({ run }) => {
        const result = await run("Can you help me add eval cases for two behaviors: 'handles unicode filenames' and 'preserves trailing newlines'?");

        await expect(result).toSatisfyJudge(RecommendsAddEvalCommandJudge);
        await expect(result).toSatisfyJudge(DoesNotRecommendHandEditingSkillMdJudge);
      },
    );
  },
);
