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
  ExplainsSkillMdIsDerivedJudge,
} from "./_judges.js";

const skillRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/evals$/, "");

describeEval(
  "explain-spec-as-source-of-truth",
  {
    harness: piAiHarness({
      createAgent: () => skilletAgent({ skillRoot }),
      tools: skilletTools({ skillRoot }),
    }),
    judgeThreshold: 0.75,
  },
  (it) => {
    it(
      "explain-spec-as-source-of-truth__edit-skill-md",
      { timeout: 120_000 },
      async ({ run }) => {
        const result = await run("I want to change the wording in my skill's SKILL.md to make the instructions clearer. Should I just edit it directly?");

        await expect(result).toSatisfyJudge(ExplainsSkillMdIsDerivedJudge);
        await expect(result).toSatisfyJudge(DirectsToSpecRefineJudge);
      },
    );

    it(
      "explain-spec-as-source-of-truth__edit-evals-vs-skill",
      { timeout: 120_000 },
      async ({ run }) => {
        const result = await run("Can I edit my eval files and SKILL.md by hand, or will skillet overwrite them?");

        await expect(result).toSatisfyJudge(ExplainsSkillMdIsDerivedJudge);
        await expect(result).toSatisfyJudge(DistinguishesEvalFilesAsDurableJudge);
      },
    );
  },
);
