## Decision

Adopt `@vitest-evals/harness-pi-ai`'s `piAiHarness` as the
harness used by every generated `.eval.ts`. Skillet's
contribution shrinks to two well-scoped exports.

### `skilletAgent({ skillRoot })`

Returns an object with a `run(input, runtime)` method that:

1. Loads the skill (SKILL.md + references + frontmatter) via
   `loadSkill(skillRoot)`. Loading happens inside `run` so
   the skill is fresh per test (relevant for
   `SKILLET_COMPARE_SKILL`-style overrides).
2. Builds a system prompt (skill body + reference list).
3. Drives the LLM-call-with-tools loop:
   - Sends `[user: input]` plus context to the LLM via
     `submitAiJob` → `completeWithBackoff`.
   - For each tool call in the response, dispatches via
     `runtime.tools.<name>(args)`. Upstream owns tracking;
     it returns the tool's result for feeding back to the
     LLM.
   - For each assistant text message, emits via
     `runtime.events.assistant(text)`.
   - Loops until the model stops calling tools or hits a
     deadline / tool-call cap.
4. Returns `{ output, usage }` where `output` is the
   concatenated assistant text and `usage` carries token /
   tool-call counts.

### `skilletTools(workDir?)`

Returns a `PiAiToolset` — `Record<string, PiAiToolDefinition>`.
Each tool's `execute(args, ctx)` calls into the existing
`src/agent/tools.ts` implementation and, for tools that
write files (Write, Edit, Bash with redirection), emits
`ctx.setArtifact(path, content)` so the artifact surfaces on
`HarnessRun.artifacts` natively.

`workDir` is optional because the harness receives `cwd` via
`ctx.metadata` (set by `createWorkspace`). Tools read
`ctx.metadata.cwd` per call instead of being bound to a
single workspace at toolset-creation time.

## Why this decomposition

- `skilletAgent` and `skilletTools` are independently useful:
  someone can re-use just the toolset with a different prompt,
  or just the agent loop with different tools.
- Both are declarative pi-ai shapes — we don't ship a
  "harness" anymore, just a pi-ai agent + its tools.
- Workspace artifact capture moves from our snapshot-diff
  to upstream's `setArtifact` model. Cooperates with
  upstream's flow; loses one form of accidental capture
  (a Bash command that writes to /tmp won't show up unless
  the tool reports it). Net positive — explicit beats
  implicit for what counts as "the deliverable."

## Migration mechanics

1. `runAgent` in `src/agent/loop.ts` had two responsibilities:
   the outer turn loop (sequencing user inputs, sharing
   context across turns) and the inner LLM+tools kernel.
   The outer loop moves into `skilletAgent.run`; the inner
   kernel stays as `runToolLoop` but its `executeTool`
   parameter changes from skillet's direct dispatch to
   `(name, args) => runtime.tools[name](args)`.
2. Each `.eval.ts` runs ONE turn (the test's input). Multi-turn
   support drops from the public eval surface — was
   `runAgent({ turns: [...] })` taking an array; the harness
   contract is single-input. Re-add multi-turn at a higher
   layer if needed (no current callers use >1 turn).

## Risks

- **Tool tracking diverges.** Our `runToolLoop` currently
  counts tool calls and surfaces them on AgentRunResult. With
  upstream tracking, we shift to reading `result.session`
  for tool call info downstream of the harness. Reporter
  and verifyResults need to read the new shape.
- **`SKILLET_COMPARE_SKILL` env override** — current
  `skilletHarness` checks the env var and swaps the loaded
  skill. New `skilletAgent` does the same check at load time.
  Same surface, just moved.
- **Per-case timeout** — was a `skilletHarness` option; moves
  into `skilletAgent`'s outer loop or relies on
  vitest-test-level timeouts. We default to 180s.

## Alternatives Considered

- **Keep skilletHarness, just rename to a less-confusing name.**
  Rejected — the duplication of upstream's normalization
  is real, not just a naming issue.
- **Wrap `piAiHarness` inside skilletHarness.** Rejected —
  defeats the point. Upstream is the harness; we contribute
  agent + tools.
- **Abandon workspace artifact capture entirely; rely on
  judges reading `result.session.outputText`.** Rejected —
  artifacts are load-bearing for skills whose deliverable is
  a file (PR body, finding report).
