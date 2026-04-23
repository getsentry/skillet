import type { EvalRunResult } from "../eval/index.js";

/**
 * Serialize eval results to JSON, written to stdout.
 */
export const printJsonResult = (result: EvalRunResult): void => {
  console.log(JSON.stringify(result, null, 2));
};
