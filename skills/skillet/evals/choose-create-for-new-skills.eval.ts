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
  RecommendsSkilletCreateJudge,
} from "./_judges.js";

const skillRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/evals$/, "");

describeEval(
  "choose-create-for-new-skills",
  { harness: skilletHarness({ skill: skillRoot }), judgeThreshold: 0.75 },
  (it) => {
    it(
      "choose-create-for-new-skills__pdf-extractor",
      { timeout: 90_000 },
      async ({ run }) => {
        const result = await run("I want to make a skill that extracts tables from PDF files. How do I get started with skillet?");

        await expect(result).toSatisfyJudge(RecommendsSkilletCreateJudge);
        await expect(result).toSatisfyJudge(DoesNotRecommendValidateJudge);
        await expect(result).toSatisfyJudge(DoesNotRecommendApiKeySetupJudge);
      },
    );
  },
);
