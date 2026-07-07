## Why

Upstream `vitest-evals` ships
`@vitest-evals/harness-pi-ai@0.9.0-beta.0` — a generic pi-ai
agent harness conforming to the `Harness<TInput, TMetadata>`
contract. Skillet currently re-implements the same shape as
`skilletHarness` in ~120 LOC. The name is misleading
(suggesting it spawns the skillet CLI), the code duplicates
upstream's normalization layer, and we own a maintenance
burden that doesn't pay rent.

Replace `skilletHarness` with upstream's `piAiHarness`.
Skillet contributes only what's actually skillet-specific:
how to load a skill into a system prompt, what tools the
agent has, and how to run the LLM-completion-with-tools loop
on top of pi-ai. Everything else — message normalization,
tool-call tracking, session building, artifact surfacing —
is upstream's job.

## What Changes

- **NEW DEPENDENCY** `@vitest-evals/harness-pi-ai@0.9.0-beta.0`
  (exact pin matching the existing `vitest-evals` beta).
- **REMOVED** `skilletHarness` export. The integration that
  loaded `SKILL.md`, ran the agent loop, and snapshotted the
  workspace is split into three smaller exports.
- **NEW** `skilletAgent({ skillRoot })` — returns a pi-ai
  agent that knows how to run the LLM loop with skillet's
  tools. Has a `run(input, runtime)` method that dispatches
  tool calls through `runtime.tools.<name>(args)` and emits
  events via `runtime.events.<role>(content)`.
- **NEW** `skilletTools(workDir)` — returns a `PiAiToolset`
  (Bash, Read, Write, Edit, Glob, Grep, ...) where each tool
  has a `{ description, execute(args, ctx) }` shape. Tools
  that write files call `ctx.setArtifact(path, content)` so
  workspace artifacts surface natively (replacing our
  snapshot-diff approach).
- **MODIFIED** `runAgent` (`src/agent/loop.ts`) — its outer
  driver moves into `skilletAgent.run`; the inner LLM-call +
  tool-dispatch + retry mechanics stay in `runToolLoop`,
  rebound to use upstream's runtime for tool dispatch.
- **MODIFIED** Eval-gen renderer emits the new shape:
  ```ts
  import { describeEval } from "vitest-evals";
  import { piAiHarness } from "@vitest-evals/harness-pi-ai";
  import { skilletAgent, skilletTools } from "@sentry/skillet/evals";

  describeEval("foo", {
    harness: piAiHarness({
      createAgent: () => skilletAgent({ skillRoot }),
      tools: skilletTools(),
    }),
  }, ...);
  ```
- **MODIFIED** Generator + verifier prompts and
  `_code-eval-contract.ts` updated for the new emit shape.
- **MODIFIED** `skills/skillet/evals/` regenerated through
  the new pipeline as the proof-of-concept.

## Capabilities

### Modified Capabilities

- `eval-format`: harness import + invocation shape change.
- `skill-authoring`: renderer template + prompts.

## Impact

- `package.json`: adds `@vitest-evals/harness-pi-ai` dep.
- `src/harness/index.ts` deleted (~120 LOC).
- New: `src/evals/skillet-agent.ts` (~80 LOC),
  `src/evals/skillet-tools.ts` (~60 LOC).
- `src/agent/loop.ts`: `runAgent` decomposed; outer driver
  to `skilletAgent.run`, inner kernel stays.
- `src/agent/tools.ts`: tool definitions converted to
  `PiAiToolDefinition` shape. Existing skillet tool
  implementations stay; only the wrapper changes.
- `src/authoring/phases/eval-gen-render.ts`: import emit
  shape changes.
- `src/authoring/prompts/`: contract + generator + verifier
  text updated.
- `src/evals.ts` barrel exports adjusted.
- `skills/skillet/evals/`: regenerated.

Investigation-first principle: skillet's own evals run
end-to-end before deleting the skilletHarness path.
