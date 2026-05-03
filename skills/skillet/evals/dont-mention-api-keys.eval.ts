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
  { harness: skilletHarness({ skill: skillRoot }), judgeThreshold: 0.75 },
  (it) => {
    it(
      "dont-mention-api-keys__how-do-i-run-evals",
      { timeout: 90_000 },
      async ({ run }) => {
        const result = await run("I just installed skillet. How do I run evals against my skill? Do I need to configure anything first?");

        await expect(result).toSatisfyJudge(DoesNotRecommendApiKeySetupJudge);
        await expect(result).toSatisfyJudge(ExplainsAutoDiscoveryJudge);
      },
    );

    it(
      "dont-mention-api-keys__which-env-var",
      { timeout: 90_000 },
      async ({ run }) => {
        const result = await run("Which environment variable does skillet read for the Anthropic API key? I want to make sure I export it correctly.");

        await expect(result).toSatisfyJudge(DoesNotRecommendApiKeySetupJudge);
        await expect(result).toSatisfyJudge(ExplainsAutoDiscoveryJudge);
      },
    );
  },
);
