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
  DistinguishesEvalsAreDurableJudge,
  DoesNotRecommendHandEditingDerivedFilesJudge,
  RecommendsSpecRefineJudge,
} from "./_judges.js";

const skillRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/evals$/, "");

describeEval(
  "dont-tell-user-to-handedit-derived-files",
  {
    harness: piAiHarness({ agent: skilletAgent({ skillRoot }) }),
    judgeThreshold: 0.75,
  },
  (it) => {
    it(
      "dont-tell-user-to-handedit-derived-files__change-skill-prose",
      { timeout: 120_000 },
      async ({ run }) => {
        const result = await run("I want to change the wording in my skill's SKILL.md to make the instructions clearer. What's the best way to edit it?");

        await expect(result).toSatisfyJudge(DoesNotRecommendHandEditingDerivedFilesJudge);
        await expect(result).toSatisfyJudge(RecommendsSpecRefineJudge);
      },
    );

    it(
      "dont-tell-user-to-handedit-derived-files__edit-eval-vs-skill",
      { timeout: 120_000 },
      async ({ run }) => {
        const result = await run("Can I just hand-edit the SKILL.md and the .eval.ts files directly to tweak my skill?");

        await expect(result).toSatisfyJudge(DoesNotRecommendHandEditingDerivedFilesJudge);
        await expect(result).toSatisfyJudge(DistinguishesEvalsAreDurableJudge);
      },
    );
  },
);
