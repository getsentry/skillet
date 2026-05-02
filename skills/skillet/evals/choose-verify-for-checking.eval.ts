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
  DoesNotRecommendValidateJudge,
  RecommendsVerifyJudge,
} from "./_judges.js";

const skillRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/evals$/, "");

describeEval(
  "choose-verify-for-checking",
  { harness: skilletHarness({ skill: skillRoot }) },
  (it) => {
    it(
      "choose-verify-for-checking__basic-ask",
      async ({ run, behavior }) => {
        behavior("choose-verify-for-checking");
        const result = await run("I want to check that my skill is internally consistent — coverage, structure, all that. What command should I run?");

        await expect(result).toSatisfyJudge(RecommendsVerifyJudge);
        await expect(result).toSatisfyJudge(DoesNotRecommendValidateJudge);
      },
    );
  },
);
