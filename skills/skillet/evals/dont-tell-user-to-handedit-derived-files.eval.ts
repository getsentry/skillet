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
  DistinguishesEvalFilesAsDurableJudge,
  DoesNotRecommendHandEditingSkillMdJudge,
  IdentifiesSkillMdAsDerivedJudge,
  RecommendsSpecRefineJudge,
} from "./_judges.js";

const skillRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/evals$/, "");

describeEval(
  "dont-tell-user-to-handedit-derived-files",
  { harness: skilletHarness({ skill: skillRoot }), judgeThreshold: 0.75 },
  (it) => {
    it(
      "dont-tell-user-to-handedit-derived-files__change-skill-instructions",
      { timeout: 90_000 },
      async ({ run }) => {
        const result = await run("I want to change the wording of one of the instructions my skill follows. Should I just open SKILL.md and edit that paragraph directly?");

        await expect(result).toSatisfyJudge(DoesNotRecommendHandEditingSkillMdJudge);
        await expect(result).toSatisfyJudge(RecommendsSpecRefineJudge);
        await expect(result).toSatisfyJudge(IdentifiesSkillMdAsDerivedJudge);
      },
    );

    it(
      "dont-tell-user-to-handedit-derived-files__eval-file-edits-ok",
      { timeout: 90_000 },
      async ({ run }) => {
        const result = await run("I want to tweak the assertions in one of my generated .eval.ts files to tighten a judge rubric. Is it safe to edit that file directly, or will it get clobbered?");

        await expect(result).toSatisfyJudge(DistinguishesEvalFilesAsDurableJudge);
      },
    );
  },
);
