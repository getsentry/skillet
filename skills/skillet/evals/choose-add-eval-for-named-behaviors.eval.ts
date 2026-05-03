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
  DoesNotRecommendHandEditingSkillMdJudge,
  DoesNotRecommendValidateJudge,
  RecommendsAddEvalJudge,
} from "./_judges.js";

const skillRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/evals$/, "");

describeEval(
  "choose-add-eval-for-named-behaviors",
  {
    harness: piAiHarness({
      createAgent: () => skilletAgent({ skillRoot }),
      tools: skilletTools({ skillRoot }),
    }),
    judgeThreshold: 0.75,
  },
  (it) => {
    it(
      "choose-add-eval-for-named-behaviors__single-behavior",
      { timeout: 90_000 },
      async ({ run }) => {
        const result = await run("I want to add an eval case for the behavior 'refuses to answer when the user asks about competitor pricing'. How do I do that with skillet?");

        await expect(result).toSatisfyJudge(RecommendsAddEvalJudge);
        await expect(result).toSatisfyJudge(DoesNotRecommendValidateJudge);
      },
    );

    it(
      "choose-add-eval-for-named-behaviors__multiple-behaviors",
      { timeout: 90_000 },
      async ({ run }) => {
        const result = await run("I have a couple of new behaviors I want covered by evals: one for handling empty input gracefully, and another for citing sources in research answers. What's the right skillet command?");

        await expect(result).toSatisfyJudge(RecommendsAddEvalJudge);
        await expect(result).toSatisfyJudge(DoesNotRecommendHandEditingSkillMdJudge);
      },
    );
  },
);
