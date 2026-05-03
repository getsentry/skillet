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
  DoesNotMentionApiKeysJudge,
  DoesNotRecommendValidateJudge,
  RecommendsSkilletCreateJudge,
} from "./_judges.js";

const skillRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/evals$/, "");

describeEval(
  "choose-create-for-new-skills",
  {
    harness: piAiHarness({ agent: skilletAgent({ skillRoot }) }),
    judgeThreshold: 0.75,
  },
  (it) => {
    it(
      "choose-create-for-new-skills__new-skill-from-description",
      { timeout: 90_000 },
      async ({ run }) => {
        const result = await run("I want to make a new skill that reviews Terraform files for security issues. How do I start?");

        await expect(result).toSatisfyJudge(RecommendsSkilletCreateJudge);
        await expect(result).toSatisfyJudge(DoesNotRecommendValidateJudge);
      },
    );

    it(
      "choose-create-for-new-skills__fresh-idea-no-files",
      { timeout: 90_000 },
      async ({ run }) => {
        const result = await run("Can you help me build a skill from scratch? I have an idea for one that audits GitHub Actions workflows.");

        await expect(result).toSatisfyJudge(RecommendsSkilletCreateJudge);
        await expect(result).toSatisfyJudge(DoesNotMentionApiKeysJudge);
      },
    );
  },
);
