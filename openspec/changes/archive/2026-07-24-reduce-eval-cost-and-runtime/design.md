# Design

## Parallelism Boundary

The compiler already emits one Vitest file per case and every trial gets a fresh workspace. Keep Vitest file parallelism disabled, mark trial tests concurrent, and cap `maxConcurrency` to the resolved value. This overlaps repeated trials and skill/baseline variants without multiplying concurrency across multiple workers.

Default concurrency is two. Valid values are integers from one through eight. CLI overrides `.skillet.yaml`, which overrides the default.

## Built-In Effort

Do not pin a model: model availability and account defaults differ. Resolve a shared effort level for built-in harnesses instead:

- default: `medium`
- config: top-level `effort: low|medium|high|xhigh`
- CLI: `--effort <level>`

Codex CLI 0.145.0 accepts `-c model_reasoning_effort="medium"`. Claude Code 2.1.208 accepts `--effort medium`. The resolved effort is attached to the built-in harness and therefore applies to agent-under-test and judge invocations. Custom harness command templates own their model and cost flags; configured effort is ignored, while an explicit `--effort` flag is rejected.
