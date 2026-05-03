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
  toolCalls,
} from "@sentry/skillet/evals";
import {
  AsksIntentQuestionsJudge,
  DoesNotInvokeSkilletPrematurelyJudge,
} from "./_judges.js";

const skillRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/evals$/, "");

describeEval(
  "capture-intent-before-generation",
  {
    harness: piAiHarness({
      createAgent: () => skilletAgent({ skillRoot }),
      tools: skilletTools({ skillRoot }),
    }),
    judgeThreshold: 0.75,
  },
  (it) => {
    it(
      "capture-intent-before-generation__new-skill-request",
      { timeout: 120_000 },
      async ({ run }) => {
        const result = await run("I want to create a new skill for reviewing Terraform files for security issues. Can you set it up?");

        const toolNames = toolCalls(result.session).map((c) => c.name);
        await expect(result).toSatisfyJudge(AsksIntentQuestionsJudge);
        await expect(result).toSatisfyJudge(DoesNotInvokeSkilletPrematurelyJudge);
        expect(toolNames).not.toContain("Bash");
      },
    );

    it(
      "capture-intent-before-generation__add-evals-request",
      { timeout: 120_000 },
      async ({ run }) => {
        const result = await run("I'd like to add some evals to my existing skill. Help me out.");

        await expect(result).toSatisfyJudge(AsksIntentQuestionsJudge);
        await expect(result).toSatisfyJudge(DoesNotInvokeSkilletPrematurelyJudge);
      },
    );
  },
);
