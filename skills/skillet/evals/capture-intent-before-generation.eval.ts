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
      "capture-intent-before-generation__vague-new-skill-request",
      { timeout: 90_000 },
      async ({ run }) => {
        const result = await run("I want to make a new skill for reviewing Terraform code for security issues.");

        const toolNames = toolCalls(result.session).map((c) => c.name);
        expect(toolNames).not.toContain("Bash");
        await expect(result).toSatisfyJudge(AsksIntentQuestionsJudge);
        expect(toolCalls(result.session)).not.toEqual(
          expect.arrayContaining([
            expect.objectContaining({ name: "Bash", arguments: expect.objectContaining({"command":"skillet"}) }),
          ]),
        );
      },
    );
  },
);
