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
  DoesNotRecommendValidateJudge,
  RecommendsVerifyJudge,
} from "./_judges.js";

const skillRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/evals$/, "");

describeEval(
  "choose-verify-for-checking",
  {
    harness: piAiHarness({ agent: skilletAgent({ skillRoot }) }),
    judgeThreshold: 0.75,
  },
  (it) => {
    it(
      "choose-verify-for-checking__internal-consistency",
      { timeout: 120_000 },
      async ({ run }) => {
        const result = await run("How do I check that my skill is internally consistent — that the spec, evals, and results all line up?");

        await expect(result).toSatisfyJudge(RecommendsVerifyJudge);
        await expect(result).toSatisfyJudge(DoesNotRecommendValidateJudge);
      },
    );

    it(
      "choose-verify-for-checking__validate-by-name",
      { timeout: 120_000 },
      async ({ run }) => {
        const result = await run("Can I just run `skillet validate` to lint my skill?");

        await expect(result).toSatisfyJudge(RecommendsVerifyJudge);
        await expect(result).toSatisfyJudge(DoesNotRecommendValidateJudge);
      },
    );
  },
);
