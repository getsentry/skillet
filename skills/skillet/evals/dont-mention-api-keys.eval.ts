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
  ExplainsAutoDiscoveryJudge,
} from "./_judges.js";

const skillRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/evals$/, "");

describeEval(
  "dont-mention-api-keys",
  { harness: skilletHarness({ skill: skillRoot }) },
  (it) => {
    it(
      "dont-mention-api-keys__how-do-i-configure-provider",
      { timeout: 90_000 },
      async ({ run, behavior }) => {
        behavior("dont-mention-api-keys");
        const result = await run("I just installed skillet and want to run my first eval. How do I configure the LLM provider so the judge calls work?");

        await expect(result).toSatisfyJudge(DoesNotRecommendApiKeySetupJudge);
        await expect(result).toSatisfyJudge(ExplainsAutoDiscoveryJudge);
      },
    );
  },
);
