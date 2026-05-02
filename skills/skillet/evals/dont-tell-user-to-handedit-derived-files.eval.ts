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
  DistinguishesEvalsAsDurableJudge,
  DoesNotRecommendHandEditingDerivedFilesJudge,
  RecommendsSpecRefineJudge,
} from "./_judges.js";

const skillRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/evals$/, "");

describeEval(
  "dont-tell-user-to-handedit-derived-files",
  { harness: skilletHarness({ skill: skillRoot }) },
  (it) => {
    it(
      "dont-tell-user-to-handedit-derived-files__tweak-skill-prose",
      async ({ run, behavior }) => {
        behavior("dont-tell-user-to-handedit-derived-files");
        const result = await run("I want to tweak the wording in my skill's SKILL.md so the agent is more cautious when handling secrets. What's the right way to do that?");

        await expect(result).toSatisfyJudge(DoesNotRecommendHandEditingDerivedFilesJudge);
        await expect(result).toSatisfyJudge(RecommendsSpecRefineJudge);
      },
    );

    it(
      "dont-tell-user-to-handedit-derived-files__edit-eval-shape",
      async ({ run, behavior }) => {
        behavior("dont-tell-user-to-handedit-derived-files");
        const result = await run("I want to refine one of my eval cases to assert on a more specific output shape, and also adjust how the skill phrases its summary. Where do I make each change?");

        await expect(result).toSatisfyJudge(DoesNotRecommendHandEditingDerivedFilesJudge);
        await expect(result).toSatisfyJudge(RecommendsSpecRefineJudge);
        await expect(result).toSatisfyJudge(DistinguishesEvalsAsDurableJudge);
      },
    );
  },
);
