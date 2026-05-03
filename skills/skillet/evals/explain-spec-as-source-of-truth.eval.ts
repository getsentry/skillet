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
  ExplainsSkillMdRegeneratedJudge,
  RecommendsSpecRefineJudge,
} from "./_judges.js";

const skillRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/evals$/, "");

describeEval(
  "explain-spec-as-source-of-truth",
  {
    harness: piAiHarness({ agent: skilletAgent({ skillRoot }) }),
    judgeThreshold: 0.75,
  },
  (it) => {
    it(
      "explain-spec-as-source-of-truth__edit-skill-md",
      { timeout: 90_000 },
      async ({ run }) => {
        const result = await run("I want to change some of the wording and rules in SKILL.md. Can I just edit the file directly?");

        await expect(result).toSatisfyJudge(ExplainsSkillMdRegeneratedJudge);
        await expect(result).toSatisfyJudge(RecommendsSpecRefineJudge);
      },
    );

    it(
      "explain-spec-as-source-of-truth__edit-evals",
      { timeout: 90_000 },
      async ({ run }) => {
        const result = await run("Can I edit the generated eval files in evals/ directly, or do those get clobbered like SKILL.md?");

        await expect(result).toSatisfyJudge(DistinguishesEvalsAreDurableJudge);
      },
    );
  },
);
