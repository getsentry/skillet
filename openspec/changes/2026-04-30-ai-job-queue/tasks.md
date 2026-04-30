# Tasks

## Queue module

- [ ] 1. `src/agent/queue.ts`: types, semaphore, classifier (lifted
       from CWB), exponential-backoff retry, AbortController-based
       timeout. Module-scoped singleton config.
- [ ] 2. Job-event sink: `onJobEvent` returns an unsubscribe.
- [ ] 3. `drainQueue()` waits for all in-flight to settle (used by
       end-of-command summary path).

## CWB rewrite

- [ ] 4. Replace `completeWithBackoff` body with a `submitAiJob` call.
       Remove the local retry loop and `BACKOFF_MS` constant.
- [ ] 5. Add optional `jobName` parameter, default `"ai"`.
- [ ] 6. Forward AbortSignal into `complete()`'s options.

## CLI plumbing

- [ ] 7. Parse `--ai-concurrency=N` (and env
       `SKILLET_AI_CONCURRENCY`) at CLI entry, before command
       dispatch. Set queue config.
- [ ] 8. Parse env `SKILLET_AI_RETRIES`, `SKILLET_AI_TIMEOUT`.
- [ ] 9. End-of-command summary: subscribe to `onJobEvent` at
       startup, print summary block on exit (success or failure).

## Deprecate per-command flags

- [ ] 10. `eval --concurrency` → print "deprecated, use
        --ai-concurrency"; map value to queue config.
- [ ] 11. `compare --concurrency` → same. (Compare loses its `2x`
        multiplier; the queue handles total throughput.)
- [ ] 12. Update help text on `eval`, `compare`.

## Threading job names (high-leverage sites)

- [ ] 13. Eval cases: pass `name: "eval-case:<case-name>"` from the
        eval runner.
- [ ] 14. Eval-gen: pass `name: "eval-gen:<behavior-id>"`.
- [ ] 15. Reference-gen: pass `name: "reference-gen:<path>"`.
- [ ] 16. Spec-author: pass `name: "spec-author:turn-<n>"`.
- [ ] 17. Semantic verify: pass `name: "verify-semantic:<batch>"`.
- [ ] 18. Judge: pass `name: "judge:<case-name>"`.

## Validation

- [ ] 19. `npm run typecheck`
- [ ] 20. `npm run check`
- [ ] 21. `openspec validate 2026-04-30-ai-job-queue --strict`
- [ ] 22. Smoke: a deliberately failing job retries and logs
        retry events.
- [ ] 23. Smoke: timeout cancels the underlying HTTP (visible via
        `--ai-timeout=2000` against a slow endpoint, no zombie
        connection).
- [ ] 24. Smoke: `skillet eval` against a small skill respects
        `--ai-concurrency=2`. End-of-command summary prints.
