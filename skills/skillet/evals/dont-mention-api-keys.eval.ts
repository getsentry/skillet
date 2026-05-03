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
  DoesNotMentionApiKeysJudge,
  ExplainsAutoDiscoveryJudge,
} from "./_judges.js";

const skillRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/evals$/, "");

describeEval(
  "dont-mention-api-keys",
  {
    harness: piAiHarness({
      createAgent: () => skilletAgent({ skillRoot }),
      tools: skilletTools({ skillRoot }),
    }),
    judgeThreshold: 0.75,
  },
  (it) => {
    it(
      "dont-mention-api-keys__how-do-i-auth",
      { timeout: 120_000 },
      async ({ run }) => {
        const result = await run("I just installed skillet. How do I authenticate it with Claude so it can run evals?");

        await expect(result).toSatisfyJudge(DoesNotMentionApiKeysJudge);
        await expect(result).toSatisfyJudge(ExplainsAutoDiscoveryJudge);
      },
    );

    it(
      "dont-mention-api-keys__which-env-var",
      { timeout: 120_000 },
      async ({ run }) => {
        const result = await run("Which environment variable should I export for skillet to find my Anthropic credentials?");

        await expect(result).toSatisfyJudge(DoesNotMentionApiKeysJudge);
        await expect(result).toSatisfyJudge(ExplainsAutoDiscoveryJudge);
      },
    );
  },
);
