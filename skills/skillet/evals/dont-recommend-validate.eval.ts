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

describeEval("dont-recommend-validate", {
  data: [
  {
    name: "dont-recommend-validate__pre_eval_check",
    tests_behavior: "dont-recommend-validate",
    input: "I just wrote a new skill and want to do a quick structural check before running evals. Walk me through the steps.",
    criteria: "The agent must recommend `skillet verify` for the structural check, not `skillet validate`. The validate command was removed and recommending it would error out for the user. If the agent says `validate` anywhere as a literal command (e.g. `skillet validate`), that's a fail.",
  },
  ],
  harness: skilletHarness({ skill: skillRoot }),
  judges: [SubstringJudge(), CriterionJudge()],
  threshold: 0.75,
  timeout: 60_000,
});
