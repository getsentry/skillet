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
  DoesNotRecommendHandEditingSkillMdJudge,
  DoesNotRecommendManualSpecImportJudge,
  DoesNotRecommendValidateJudge,
  RecommendsImproveJudge,
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
      "choose-improve-for-existing-skills__legacy-skill-md-only",
      { timeout: 90_000 },
      async ({ run }) => {
        const cwd = createWorkspace(skillRoot, "choose-improve-for-existing-skills__legacy-skill-md-only");
        const result = await run("I have an existing skill at ./skills/code-reviewer with a SKILL.md but no spec.yaml. It's not working well — the agent keeps missing obvious bugs. How do I make it better?", { metadata: { cwd } });

        await expect(result).toSatisfyJudge(RecommendsImproveJudge);
        await expect(result).toSatisfyJudge(DoesNotRecommendManualSpecImportJudge);
        await expect(result).toSatisfyJudge(DoesNotRecommendValidateJudge);
      },
    );

    it(
      "choose-improve-for-existing-skills__has-spec-yaml",
      { timeout: 90_000 },
      async ({ run }) => {
        const cwd = createWorkspace(skillRoot, "choose-improve-for-existing-skills__has-spec-yaml");
        const result = await run("My skill at ./skills/sql-auditor already has a spec.yaml and some evals, but a few cases are failing. What should I run to iterate on it?", { metadata: { cwd } });

        await expect(result).toSatisfyJudge(RecommendsImproveJudge);
        await expect(result).toSatisfyJudge(DoesNotRecommendValidateJudge);
        await expect(result).toSatisfyJudge(DoesNotRecommendHandEditingSkillMdJudge);
      },
    );
  },
);
