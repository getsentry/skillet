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
  DoesNotRecommendUnscopedJudge,
  IdentifiesScopedPackageJudge,
} from "./_judges.js";

const skillRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/evals$/, "");

describeEval(
  "scope-package-name",
  { harness: skilletHarness({ skill: skillRoot }) },
  (it) => {
    it(
      "scope-package-name__how-to-run",
      async ({ run, behavior }) => {
        behavior("scope-package-name");
        const result = await run("How do I run skillet to regenerate my skill?");

        await expect(result).toSatisfyJudge(IdentifiesScopedPackageJudge);
        await expect(result).toSatisfyJudge(DoesNotRecommendUnscopedJudge);
      },
    );

    it(
      "scope-package-name__corrects-unscoped",
      async ({ run, behavior }) => {
        behavior("scope-package-name");
        const result = await run("I tried `npx skillet regen` and it didn't work the way I expected. What's the right command?");

        await expect(result).toSatisfyJudge(IdentifiesScopedPackageJudge);
        await expect(result).toSatisfyJudge(DoesNotRecommendUnscopedJudge);
      },
    );
  },
);
