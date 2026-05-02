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
  "dont-recommend-validate",
  { harness: skilletHarness({ skill: skillRoot }) },
  (it) => {
    it(
      "dont-recommend-validate__how-to-check-skill",
      { timeout: 90_000 },
      async ({ run, behavior }) => {
        behavior("dont-recommend-validate");
        const result = await run("I just edited my skill spec. How do I check that the skill files are structurally valid before running the full eval suite?");

        await expect(result).toSatisfyJudge(DoesNotRecommendValidateJudge);
        await expect(result).toSatisfyJudge(RecommendsVerifyJudge);
      },
    );
  },
);
