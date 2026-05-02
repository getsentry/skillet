/**
 * End-of-command summary for the AI job queue.
 *
 * Subscribes to `onJobEvent` once at process startup, accumulates
 * succeeded / failed counts, and prints a one-block summary when
 * the CLI exits. Failed jobs are clustered by `name` prefix
 * (e.g. `eval-gen:*` with how many of each failed) so the user can
 * see at a glance whether a single phase was unhealthy.
 */

import { onJobEvent, type JobEvent } from "../agent/queue.js";

interface JobStats {
  succeeded: number;
  failed: number;
  failuresByPrefix: Map<string, string[]>;
}

const stats: JobStats = {
  succeeded: 0,
  failed: 0,
  failuresByPrefix: new Map(),
};

const recordEvent = (e: JobEvent): void => {
  if (e.kind === "succeeded") {
    stats.succeeded++;
  }
  if (e.kind === "failed") {
    stats.failed++;
    const prefix = e.name.split(":")[0] ?? "ai";
    const list = stats.failuresByPrefix.get(prefix) ?? [];
    list.push(e.name);
    stats.failuresByPrefix.set(prefix, list);
  }
};

let installed = false;

/** Install the queue subscriber once. Idempotent. */
export const installJobSummary = (): void => {
  if (installed) return;
  onJobEvent(recordEvent);
  installed = true;
};

/** Print the accumulated summary to stderr (no-op when nothing ran). */
export const printJobSummary = (): void => {
  if (stats.succeeded + stats.failed === 0) return;
  process.stderr.write(
    `\x1b[2mAI jobs: ${stats.succeeded} succeeded, ${stats.failed} failed\x1b[0m\n`,
  );
  if (stats.failed > 0) {
    process.stderr.write("\x1b[2mFailures clustered by name prefix:\x1b[0m\n");
    for (const [prefix, names] of stats.failuresByPrefix) {
      const sample = names.slice(0, 5).join(", ");
      const more = names.length > 5 ? ` (+${names.length - 5} more)` : "";
      process.stderr.write(
        `\x1b[2m  ${prefix}:* — ${names.length} failed (${sample}${more})\x1b[0m\n`,
      );
    }
  }
};
