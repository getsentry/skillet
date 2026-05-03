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
  DoesNotRecommendUnscopedPackageJudge,
  RecommendsScopedPackageJudge,
} from "./_judges.js";

const skillRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/evals$/, "");

describeEval(
  "scope-package-name",
  {
    harness: piAiHarness({
      createAgent: () => skilletAgent({ skillRoot }),
      tools: skilletTools({ skillRoot }),
    }),
    judgeThreshold: 0.75,
  },
  (it) => {
    it(
      "scope-package-name__how-to-run",
      { timeout: 90_000 },
      async ({ run }) => {
        const result = await run("How do I run skillet from the command line to evaluate my skill?");

        await expect(result).toSatisfyJudge(RecommendsScopedPackageJudge);
        await expect(result).toSatisfyJudge(DoesNotRecommendUnscopedPackageJudge);
      },
    );
  },
);
