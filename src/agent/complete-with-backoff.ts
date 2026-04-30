import { complete } from "@mariozechner/pi-ai";
import type { AssistantMessage, Context } from "@mariozechner/pi-ai";
import type { AnyModel } from "./provider.js";
import { submitAiJob, type AiJob } from "./queue.js";

export interface CompleteWithBackoffExtras {
  /** Telemetry name for the AI queue. Default `"ai"`. Convention:
   *  "phase:identifier", e.g. "eval-gen:flag-n-plus-one". */
  jobName?: string;
  /** Per-job timeout override (ms). Use a tighter cap for short
   *  JSON-output phases so a stuck call retries quickly instead of
   *  burning the global 4-min budget. */
  timeoutMs?: number;
  /** Per-job retry override. Set to 0 when the caller does its own
   *  retry on parse/validate failures and doesn't want the queue to
   *  compound retries. */
  maxRetries?: number;
}

/**
 * Submit a single LLM call as an AI job. Concurrency, retry, and
 * timeout are owned by the queue (see `src/agent/queue.ts`); this
 * function is now a thin pi-ai wrapper. Pass extras to override
 * per-job behavior — `jobName` for telemetry clustering, `timeoutMs`
 * to cap a short JSON phase, `maxRetries: 0` to disable queue retry
 * when the caller does its own.
 */
export const completeWithBackoff = async (
  model: AnyModel,
  context: Context,
  options?: Parameters<typeof complete>[2],
  extrasOrJobName: CompleteWithBackoffExtras | string = {},
): Promise<AssistantMessage> => {
  const extras: CompleteWithBackoffExtras =
    typeof extrasOrJobName === "string" ? { jobName: extrasOrJobName } : extrasOrJobName;
  const job: AiJob<AssistantMessage> = {
    name: extras.jobName ?? "ai",
    run: (signal) => complete(model, context, { ...options, signal }),
  };
  if (extras.timeoutMs != null) job.timeoutMs = extras.timeoutMs;
  if (extras.maxRetries != null) job.maxRetries = extras.maxRetries;
  return submitAiJob(job);
};
