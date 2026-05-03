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
  DoesNotRecommendUnscopedPackageJudge,
  UsesScopedPackageNameJudge,
} from "./_judges.js";

const skillRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/evals$/, "");

describeEval(
  "scope-package-name",
  {
    harness: piAiHarness({ agent: skilletAgent({ skillRoot }) }),
    judgeThreshold: 0.75,
  },
  (it) => {
    it(
      "scope-package-name__how-to-run",
      { timeout: 90_000 },
      async ({ run }) => {
        const result = await run("How do I run skillet to regenerate my skill? Give me the exact command.");

        await expect(result).toSatisfyJudge(UsesScopedPackageNameJudge);
        await expect(result).toSatisfyJudge(DoesNotRecommendUnscopedPackageJudge);
      },
    );

    it(
      "scope-package-name__getting-started",
      { timeout: 90_000 },
      async ({ run }) => {
        const result = await run("I'm new to skillet. What's the npx command to get started?");

        await expect(result).toSatisfyJudge(UsesScopedPackageNameJudge);
        await expect(result).toSatisfyJudge(DoesNotRecommendUnscopedPackageJudge);
      },
    );
  },
);
