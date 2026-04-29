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

describeEval("explain-spec-as-source-of-truth", {
  data: [
  {
    name: "explain-spec-as-source-of-truth__handedit_question",
    tests_behavior: "explain-spec-as-source-of-truth",
    input: "Can I just edit the SKILL.md directly to change the wording of one of the rules?",
    criteria: "The agent should explain that SKILL.md is derived from spec.yaml and that hand edits will be overwritten on the next regen. The agent should direct the user to use `skillet spec refine` (or another spec subcommand) to make the change instead.",
  },
  ],
  harness: skilletHarness({ skill: skillRoot }),
  judges: [SubstringJudge(), CriterionJudge()],
  threshold: 0.75,
  timeout: 60_000,
});
