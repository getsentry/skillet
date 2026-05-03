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
  DoesNotRecommendValidateJudge,
  RecommendsVerifyJudge,
} from "./_judges.js";

const skillRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/evals$/, "");

describeEval(
  "dont-recommend-validate",
  {
    harness: piAiHarness({
      createAgent: () => skilletAgent({ skillRoot }),
      tools: skilletTools({ skillRoot }),
    }),
    judgeThreshold: 0.75,
  },
  (it) => {
    it(
      "dont-recommend-validate__how-to-check-skill",
      { timeout: 90_000 },
      async ({ run }) => {
        const result = await run("I just edited my skill's SKILL.md frontmatter. What skillet command should I run to check that everything is structurally correct before I commit?");

        await expect(result).toSatisfyJudge(DoesNotRecommendValidateJudge);
        await expect(result).toSatisfyJudge(RecommendsVerifyJudge);
      },
    );
  },
);
