import { complete } from "@mariozechner/pi-ai";
import type { AssistantMessage, Context } from "@mariozechner/pi-ai";
import type { AnyModel } from "./provider.js";
import { submitAiJob } from "./queue.js";

/**
 * Submit a single LLM call as an AI job. Concurrency, retry, and
 * timeout are owned by the queue (see `src/agent/queue.ts`); this
 * function is now a thin pi-ai wrapper. The optional `jobName`
 * lets callers tag the job for end-of-command telemetry.
 */
export const completeWithBackoff = async (
  model: AnyModel,
  context: Context,
  options?: Parameters<typeof complete>[2],
  jobName: string = "ai",
): Promise<AssistantMessage> => {
  return submitAiJob({
    name: jobName,
    run: (signal) => complete(model, context, { ...options, signal }),
  });
};
