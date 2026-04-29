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

describeEval("choose-improve-for-existing-skills", {
  data: [
  {
    name: "choose-improve-for-existing-skills__existing_skill_path",
    tests_behavior: "choose-improve-for-existing-skills",
    input: "I already have a SKILL.md at ./my-review-skill but it needs work. What command?",
    criteria: "The primary recommendation must be `skillet improve`. The agent may mention that improve auto-imports legacy skills (no separate `spec import` step), but `improve` must be the clear first recommendation.",
  },
  ],
  harness: skilletHarness({ skill: skillRoot }),
  judges: [SubstringJudge(), CriterionJudge()],
  threshold: 0.75,
  timeout: 60_000,
});
