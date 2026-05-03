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
} from "@sentry/skillet/evals";
import {
  DoesNotRecommendHandEditingDerivedFilesJudge,
  RecommendsAddEvalCommandJudge,
} from "./_judges.js";

const skillRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/evals$/, "");

describeEval(
  "choose-add-eval-for-named-behaviors",
  {
    harness: piAiHarness({ agent: skilletAgent({ skillRoot }) }),
    judgeThreshold: 0.75,
  },
  (it) => {
    it(
      "choose-add-eval-for-named-behaviors__single-behavior",
      { timeout: 120_000 },
      async ({ run }) => {
        const result = await run("I want to add an eval case for the behavior \"rejects empty input\" to my skill. How do I do that?");

        await expect(result).toSatisfyJudge(RecommendsAddEvalCommandJudge);
        await expect(result).toSatisfyJudge(DoesNotRecommendHandEditingDerivedFilesJudge);
      },
    );

    it(
      "choose-add-eval-for-named-behaviors__multiple-behaviors",
      { timeout: 120_000 },
      async ({ run }) => {
        const result = await run("I'd like to add eval cases for two behaviors: \"handles unicode filenames\" and \"warns on missing config\". What's the right command?");

        await expect(result).toSatisfyJudge(RecommendsAddEvalCommandJudge);
      },
    );
  },
);
