// Test fixture for verify's coverage layer. Discovery-only;
// not run as part of skillet's own self-tests.
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import {
  describeEval,
  SubstringJudge,
  skilletHarness,
} from "@sentry/skillet/evals";

const skillRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/evals$/, "");

describeEval("covered-behavior", {
  data: [
    {
      name: "covered-behavior__placeholder",
      tests_behavior: "covered-behavior",
      input: "test",
      expectedContains: "test",
    },
  ],
  harness: skilletHarness({ skill: skillRoot }),
  judges: [SubstringJudge()],
  timeout: 30_000,
});
