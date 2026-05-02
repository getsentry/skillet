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
  DoesNotRecommendManualSpecImportJudge,
  DoesNotRecommendValidateJudge,
  RecommendsSkilletImproveJudge,
} from "./_judges.js";

const skillRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/evals$/, "");

describeEval(
  "choose-improve-for-existing-skills",
  { harness: skilletHarness({ skill: skillRoot }) },
  (it) => {
    it(
      "choose-improve-for-existing-skills__legacy-skill-md-only",
      { timeout: 90_000 },
      async ({ run, behavior, harness }) => {
        behavior("choose-improve-for-existing-skills");
        await harness.useFixture("choose-improve-for-existing-skills__legacy-skill-md-only");
        const result = await run("I have an existing skill in ./my-skill with just a SKILL.md file (no spec.yaml). It's not behaving well — agents skip steps. How should I work on it with skillet?");

        await expect(result).toSatisfyJudge(RecommendsSkilletImproveJudge);
        await expect(result).toSatisfyJudge(DoesNotRecommendManualSpecImportJudge);
        await expect(result).toSatisfyJudge(DoesNotRecommendValidateJudge);
      },
    );

    it(
      "choose-improve-for-existing-skills__has-spec-yaml",
      { timeout: 90_000 },
      async ({ run, behavior, harness }) => {
        behavior("choose-improve-for-existing-skills");
        await harness.useFixture("choose-improve-for-existing-skills__has-spec-yaml");
        const result = await run("My skill at ./code-reviewer already has a spec.yaml and some evals, but two behaviors keep failing. What's the right skillet command to iterate on it?");

        await expect(result).toSatisfyJudge(RecommendsSkilletImproveJudge);
        await expect(result).toSatisfyJudge(DoesNotRecommendValidateJudge);
      },
    );
  },
);
