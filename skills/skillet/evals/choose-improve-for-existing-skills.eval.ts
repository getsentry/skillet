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
  createWorkspace,
  describeEval,
  piAiHarness,
  skilletAgent,
  skilletTools,
} from "@sentry/skillet/evals";
import {
  DoesNotRecommendManualSpecImportJudge,
  DoesNotRecommendValidateJudge,
  RecommendsImproveCommandJudge,
} from "./_judges.js";

const skillRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/evals$/, "");

describeEval(
  "choose-improve-for-existing-skills",
  {
    harness: piAiHarness({
      createAgent: () => skilletAgent({ skillRoot }),
      tools: skilletTools({ skillRoot }),
    }),
    judgeThreshold: 0.75,
  },
  (it) => {
    it(
      "choose-improve-for-existing-skills__legacy-skill-md",
      { timeout: 90_000 },
      async ({ run }) => {
        const cwd = createWorkspace(skillRoot, "choose-improve-for-existing-skills__legacy-skill-md");
        const result = await run("I have a skill at ./skills/code-reviewer with just a SKILL.md (no spec.yaml). It's been giving mediocre results and I want to make it better. What should I do?", { metadata: { cwd } });

        await expect(result).toSatisfyJudge(RecommendsImproveCommandJudge);
        await expect(result).toSatisfyJudge(DoesNotRecommendManualSpecImportJudge);
      },
    );

    it(
      "choose-improve-for-existing-skills__has-spec-needs-work",
      { timeout: 90_000 },
      async ({ run }) => {
        const cwd = createWorkspace(skillRoot, "choose-improve-for-existing-skills__has-spec-needs-work");
        const result = await run("My skill at ./skills/sql-helper has a spec.yaml and evals already, but the eval pass rate is low. How do I iterate on it?", { metadata: { cwd } });

        await expect(result).toSatisfyJudge(RecommendsImproveCommandJudge);
        await expect(result).toSatisfyJudge(DoesNotRecommendValidateJudge);
      },
    );
  },
);
