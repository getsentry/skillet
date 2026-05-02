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
  toolCalls,
} from "@sentry/skillet/evals";
import {
  AsksIntentQuestionsJudge,
  CoversIntentDimensionsJudge,
  DoesNotGenerateBeforeInterviewJudge,
} from "./_judges.js";

const skillRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/evals$/, "");

describeEval(
  "capture-intent-before-generation",
  { harness: skilletHarness({ skill: skillRoot }) },
  (it) => {
    it(
      "capture-intent-before-generation__new-skill-request",
      { timeout: 90_000 },
      async ({ run, behavior }) => {
        behavior("capture-intent-before-generation");
        const result = await run("I want to make a new skill for reviewing Terraform modules for security issues. Can you set it up?");

        const toolNames = toolCalls(result.session).map((c) => c.name);
        expect(toolNames).not.toContain("Bash");
        await expect(result).toSatisfyJudge(AsksIntentQuestionsJudge);
        await expect(result).toSatisfyJudge(DoesNotGenerateBeforeInterviewJudge);
        await expect(result).toSatisfyJudge(CoversIntentDimensionsJudge);
      },
    );

    it(
      "capture-intent-before-generation__add-evals-request",
      { timeout: 90_000 },
      async ({ run, behavior, harness }) => {
        behavior("capture-intent-before-generation");
        await harness.useFixture("capture-intent-before-generation__add-evals-request");
        const result = await run("Can you add some evals to my existing skill in skills/code-reviewer/?");

        await expect(result).toSatisfyJudge(AsksIntentQuestionsJudge);
        await expect(result).toSatisfyJudge(DoesNotGenerateBeforeInterviewJudge);
        await expect(result).toSatisfyJudge(CoversIntentDimensionsJudge);
      },
    );
  },
);
