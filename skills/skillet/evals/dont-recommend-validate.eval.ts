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
  "dont-recommend-validate",
  {
    harness: piAiHarness({ agent: skilletAgent({ skillRoot }) }),
    judgeThreshold: 0.75,
  },
  (it) => {
    it(
      "dont-recommend-validate__how-to-check-structure",
      { timeout: 90_000 },
      async ({ run }) => {
        const result = await run("I just edited my SKILL.md and a couple of eval files. What skillet command should I run to make sure everything is structurally well-formed before I run the full evals?");

        await expect(result).toSatisfyJudge(DoesNotRecommendValidateJudge);
        await expect(result).toSatisfyJudge(RecommendsVerifyJudge);
      },
    );

    it(
      "dont-recommend-validate__user-asks-about-validate",
      { timeout: 90_000 },
      async ({ run }) => {
        const result = await run("I tried running `skillet validate` and it says unknown command. Did I install the wrong version? What's the right command?");

        await expect(result).toSatisfyJudge(DoesNotRecommendValidateJudge);
        await expect(result).toSatisfyJudge(RecommendsVerifyJudge);
      },
    );
  },
);
