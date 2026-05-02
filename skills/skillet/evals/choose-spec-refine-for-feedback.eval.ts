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
  DoesNotRecommendHandEditingDerivedFilesJudge,
  DoesNotRecommendValidateJudge,
  RecommendsSpecRefineJudge,
} from "./_judges.js";

const skillRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/evals$/, "");

describeEval(
  "choose-spec-refine-for-feedback",
  { harness: skilletHarness({ skill: skillRoot }) },
  (it) => {
    it(
      "choose-spec-refine-for-feedback__tone-change",
      { timeout: 90_000 },
      async ({ run, behavior }) => {
        behavior("choose-spec-refine-for-feedback");
        const result = await run("I want my skill to be more concise and stop using bullet lists everywhere. How do I make that change?");

        await expect(result).toSatisfyJudge(RecommendsSpecRefineJudge);
        await expect(result).toSatisfyJudge(DoesNotRecommendHandEditingDerivedFilesJudge);
        await expect(result).toSatisfyJudge(DoesNotRecommendValidateJudge);
      },
    );
  },
);
