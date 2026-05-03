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
  createWorkspace,
  describeEval,
  piAiHarness,
  skilletAgent,
  toolCalls,
} from "@sentry/skillet/evals";
import {
  AsksIntentQuestionsJudge,
  DoesNotInvokeCLIPrematurelyJudge,
} from "./_judges.js";

const skillRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/evals$/, "");

describeEval(
  "capture-intent-before-generation",
  {
    harness: piAiHarness({ agent: skilletAgent({ skillRoot }) }),
    judgeThreshold: 0.75,
  },
  (it) => {
    it(
      "capture-intent-before-generation__vague-new-skill-request",
      { timeout: 90_000 },
      async ({ run }) => {
        const result = await run("I want to make a skill for reviewing Terraform code for security issues.");

        const toolNames = toolCalls(result.session).map((c) => c.name);
        expect(toolNames).not.toContain("Bash");
        expect(toolNames).not.toContain("bash");
        await expect(result).toSatisfyJudge(AsksIntentQuestionsJudge);
        await expect(result).toSatisfyJudge(DoesNotInvokeCLIPrematurelyJudge);
      },
    );

    it(
      "capture-intent-before-generation__add-evals-request",
      { timeout: 90_000 },
      async ({ run }) => {
        const cwd = createWorkspace(skillRoot, "capture-intent-before-generation__add-evals-request");
        const result = await run("Can you add some evals to my existing skill?", { metadata: { cwd } });

        const toolNames = toolCalls(result.session).map((c) => c.name);
        expect(toolNames).not.toContain("Bash");
        expect(toolNames).not.toContain("bash");
        await expect(result).toSatisfyJudge(AsksIntentQuestionsJudge);
        await expect(result).toSatisfyJudge(DoesNotInvokeCLIPrematurelyJudge);
      },
    );
  },
);
