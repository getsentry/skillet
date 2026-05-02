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
  ExplainsSkillMdRegeneratedJudge,
  RecommendsSpecRefineJudge,
} from "./_judges.js";

const skillRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/evals$/, "");

describeEval(
  "explain-spec-as-source-of-truth",
  { harness: skilletHarness({ skill: skillRoot }) },
  (it) => {
    it(
      "explain-spec-as-source-of-truth__how-to-edit-skillmd",
      { timeout: 90_000 },
      async ({ run, behavior }) => {
        behavior("explain-spec-as-source-of-truth");
        const result = await run("I want to change how my skill behaves — should I just edit SKILL.md directly?");

        await expect(result).toSatisfyJudge(ExplainsSkillMdRegeneratedJudge);
        await expect(result).toSatisfyJudge(RecommendsSpecRefineJudge);
        await expect(result).toSatisfyJudge(DoesNotRecommendHandEditingDerivedFilesJudge);
      },
    );

    it(
      "explain-spec-as-source-of-truth__can-i-edit-evals",
      { timeout: 90_000 },
      async ({ run, behavior }) => {
        behavior("explain-spec-as-source-of-truth");
        const result = await run("Can I edit the files under evals/ directly to tweak my test cases, or will those get regenerated too?");

        await expect(result).toSatisfyJudge(DistinguishesEvalsAsDurableJudge);
        await expect(result).toSatisfyJudge(DoesNotRecommendHandEditingDerivedFilesJudge);
      },
    );
  },
);
