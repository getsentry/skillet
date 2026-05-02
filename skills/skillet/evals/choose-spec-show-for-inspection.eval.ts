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
  DoesNotRecommendApiKeySetupJudge,
  DoesNotRecommendValidateJudge,
  RecommendsSpecShowJudge,
} from "./_judges.js";

const skillRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/evals$/, "");

describeEval(
  "choose-spec-show-for-inspection",
  { harness: skilletHarness({ skill: skillRoot }) },
  (it) => {
    it(
      "choose-spec-show-for-inspection__read-current-spec",
      { timeout: 90_000 },
      async ({ run, behavior }) => {
        behavior("choose-spec-show-for-inspection");
        const result = await run("I just want to read my current skill spec to see what behaviors are defined — I don't want to change anything. What command should I run?");

        await expect(result).toSatisfyJudge(RecommendsSpecShowJudge);
        await expect(result).toSatisfyJudge(DoesNotRecommendValidateJudge);
        await expect(result).toSatisfyJudge(DoesNotRecommendApiKeySetupJudge);
      },
    );
  },
);
