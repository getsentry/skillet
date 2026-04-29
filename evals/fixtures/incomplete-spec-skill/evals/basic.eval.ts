// Test fixture for verify's coverage layer. Intentionally has an
// orphan case (tests_behavior pointing at a non-existent spec id)
// alongside a covered case. Skillet's own evals don't actually run
// this — it's discovery-only fixture data for verify tests.

import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import {
  describeEval,
  SubstringJudge,
  skilletHarness,
} from "@sentry/skillet/evals";

const skillRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/evals$/, "");

describeEval("incomplete-skill", {
  data: [
    {
      name: "covered-behavior__placeholder",
      tests_behavior: "covered-behavior",
      input: "test",
      expectedContains: "test",
    },
    // Intentional orphan — tests_behavior does not exist in spec.yaml.
    {
      name: "orphan-case__intentional",
      tests_behavior: "nonexistent-behavior",
      input: "test",
      expectedContains: "test",
    },
  ],
  harness: skilletHarness({ skill: skillRoot }),
  judges: [SubstringJudge()],
  timeout: 30_000,
});
