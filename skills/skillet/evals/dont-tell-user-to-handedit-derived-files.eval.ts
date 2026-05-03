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
  DistinguishesEvalFilesAsDurableJudge,
  DoesNotRecommendHandEditingSkillMdJudge,
  RecommendsSpecRefineJudge,
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
      "dont-tell-user-to-handedit-derived-files__change-behavior",
      { timeout: 90_000 },
      async ({ run }) => {
        const result = await run("I want to change how my skill behaves — it should refuse certain inputs. Should I just edit SKILL.md to add that instruction?");

        await expect(result).toSatisfyJudge(DoesNotRecommendHandEditingSkillMdJudge);
        await expect(result).toSatisfyJudge(RecommendsSpecRefineJudge);
      },
    );

    it(
      "dont-tell-user-to-handedit-derived-files__tweak-eval",
      { timeout: 90_000 },
      async ({ run }) => {
        const result = await run("One of my eval cases has the wrong assertion shape — I want to tighten the judge rubric. Do I need to regenerate, or can I just edit the .eval.ts file? And should I touch SKILL.md while I'm at it?");

        await expect(result).toSatisfyJudge(DoesNotRecommendHandEditingSkillMdJudge);
        await expect(result).toSatisfyJudge(DistinguishesEvalFilesAsDurableJudge);
      },
    );
  },
);
