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
  DirectsToSpecRefineJudge,
  DistinguishesEvalFilesAsDurableJudge,
  DoesNotRecommendHandEditingSkillMdJudge,
} from "./_judges.js";

const skillRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/evals$/, "");

describeEval(
  "dont-tell-user-to-handedit-derived-files",
  {
    harness: piAiHarness({
      createAgent: () => skilletAgent({ skillRoot }),
      tools: skilletTools({ skillRoot }),
    }),
    judgeThreshold: 0.75,
  },
  (it) => {
    it(
      "dont-tell-user-to-handedit-derived-files__change-skill-behavior",
      { timeout: 120_000 },
      async ({ run }) => {
        const result = await run("I want to change how my skill responds when the user asks about severity ratings — it should always justify the rating. Where do I edit that? Should I just open SKILL.md and rewrite that section?");

        await expect(result).toSatisfyJudge(DoesNotRecommendHandEditingSkillMdJudge);
        await expect(result).toSatisfyJudge(DirectsToSpecRefineJudge);
      },
    );

    it(
      "dont-tell-user-to-handedit-derived-files__tweak-eval-assertion",
      { timeout: 120_000 },
      async ({ run }) => {
        const result = await run("One of my generated eval cases has an assertion that's too strict. Can I just edit the .eval.ts file directly, or do I need to regenerate? And while I'm at it, can I tweak the wording in SKILL.md the same way?");

        await expect(result).toSatisfyJudge(DoesNotRecommendHandEditingSkillMdJudge);
        await expect(result).toSatisfyJudge(DistinguishesEvalFilesAsDurableJudge);
      },
    );
  },
);
