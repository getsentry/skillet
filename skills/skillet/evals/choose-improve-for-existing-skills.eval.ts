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
} from "@sentry/skillet/evals";
import {
  DoesNotRecommendManualSpecImportJudge,
  RecommendsImproveCommandJudge,
} from "./_judges.js";

const skillRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/evals$/, "");

describeEval(
  "choose-improve-for-existing-skills",
  {
    harness: piAiHarness({ agent: skilletAgent({ skillRoot }) }),
    judgeThreshold: 0.75,
  },
  (it) => {
    it(
      "choose-improve-for-existing-skills__legacy-skill-md",
      { timeout: 120_000 },
      async ({ run }) => {
        const cwd = createWorkspace(skillRoot, "choose-improve-for-existing-skills__legacy-skill-md");
        const result = await run("I have an existing skill at skills/code-reviewer with a SKILL.md but no spec.yaml. It's not catching bugs reliably. How do I make it better?", { metadata: { cwd } });

        await expect(result).toSatisfyJudge(RecommendsImproveCommandJudge);
        await expect(result).toSatisfyJudge(DoesNotRecommendManualSpecImportJudge);
      },
    );

    it(
      "choose-improve-for-existing-skills__has-spec-yaml",
      { timeout: 120_000 },
      async ({ run }) => {
        const cwd = createWorkspace(skillRoot, "choose-improve-for-existing-skills__has-spec-yaml");
        const result = await run("My skill at skills/sql-auditor already has a spec.yaml and evals. Some evals are failing. What do I run?", { metadata: { cwd } });

        await expect(result).toSatisfyJudge(RecommendsImproveCommandJudge);
      },
    );
  },
);
