// ──────────────────────────────────────────────────────────
// Generated initially from spec.yaml; durable after that. Edit
// freely to refine prompts, setup, and assertions for this
// behavior. Add or remove behaviors via spec.yaml — skillet only
// regenerates eval files for behaviors that don't have one yet.
// ──────────────────────────────────────────────────────────
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import {
  describeEval,
  CriterionJudge,
  SubstringJudge,
  skilletHarness,
} from "@sentry/skillet/evals";

const skillRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/evals$/, "");

describeEval("choose-create-for-new-skills", {
  data: [
  {
    name: "choose-create-for-new-skills__new_python_skill",
    tests_behavior: "choose-create-for-new-skills",
    input: "I need a skill for reviewing Python imports. What skillet command should I use?",
    criteria: "The agent must recommend `skillet create` (via `npx @sentry/skillet create`) as the primary command for new skills. Both `create` and the `@sentry/skillet` package name should appear in the recommendation.",
  },
  ],
  harness: skilletHarness({ skill: skillRoot }),
  judges: [SubstringJudge(), CriterionJudge()],
  threshold: 0.75,
  timeout: 60_000,
});
