# Design

Change the single `DEFAULT_EFFORT` owner from `medium` to `low`. Resolved built-in harnesses carry that required value into both agent-under-test and judge invocations. No CLI, config shape, custom harness behavior, concurrency, baseline, or JSON contracts change.
