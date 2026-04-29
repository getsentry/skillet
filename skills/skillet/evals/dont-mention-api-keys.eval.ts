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

describeEval("dont-mention-api-keys", {
  data: [
  {
    name: "dont-mention-api-keys__setup_question",
    tests_behavior: "dont-mention-api-keys",
    input: "I want to use skillet to create a new skill. What do I need to set up first?",
    criteria: "The agent must NOT tell the user to set any API keys or environment variables (e.g. ANTHROPIC_API_KEY, OPENAI_API_KEY). It should explain that credentials are auto-discovered or simply tell the user to run the create command directly. Even mentioning the env var names by name is incorrect.",
  },
  ],
  harness: skilletHarness({ skill: skillRoot }),
  judges: [SubstringJudge(), CriterionJudge()],
  threshold: 0.75,
  timeout: 60_000,
});
