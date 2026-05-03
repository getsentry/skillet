## MODIFIED Requirements

### Requirement: Eval-file layout per skill

A skill's `evals/` directory SHALL contain three kinds of
artifact:

- `evals/_judges.ts` — suite-wide canonical named-judge
  declarations, one
  `export const FooJudge = criterionJudge("FooJudge", "...")`
  per unique judge across the suite. Generated; rewritten on
  every regen.
- `evals/fixtures/<case-slug>/<rel-path>` — per-case workspace
  seed files (real, readable files on disk).
- `evals/<entry-id>.eval.ts` — one file per spec entry.
  Imports the harness factory `piAiHarness` from
  `@vitest-evals/harness-pi-ai`, the `skilletAgent` /
  `skilletTools` exports plus `createWorkspace` /
  `criterionJudge` from `@sentry/skillet/evals`, and the
  named judges it references from `./_judges.js`.

#### Scenario: Generated eval file imports piAiHarness from upstream
- **WHEN** eval-gen renders a behavior to TypeScript
- **THEN** the file imports `piAiHarness` from
  `@vitest-evals/harness-pi-ai` and `describeEval` /
  `toolCalls` from `vitest-evals`
- **AND** the file imports `skilletAgent`, `skilletTools`,
  `createWorkspace` from `@sentry/skillet/evals`
- **AND** does NOT import any harness named `skilletHarness`

#### Scenario: Disk-backed fixtures use vitest-native lifecycle
- **GIVEN** a case that needs the agent to audit
  `.github/workflows/ci.yml`
- **THEN** `evals/fixtures/<case-name>/.github/workflows/ci.yml`
  exists with the YAML content
- **AND** the rendered eval body contains
  `const cwd = createWorkspace(skillRoot, "<case-name>")`
  followed by `await run(input, { metadata: { cwd } })`

### Requirement: Harness invocation shape

Generated `describeEval` blocks SHALL pass an upstream
`piAiHarness(...)` instance as the harness. Skillet's
contribution to the harness is two pieces:

- `createAgent: () => skilletAgent({ skillRoot })` — the
  pi-ai agent that loads the skill and drives the LLM loop.
- `tools: skilletTools()` — the `PiAiToolset` of agent tools
  (Bash, Read, Write, Edit, Glob, Grep, etc.) where each
  tool's `execute(args, ctx)` performs the action and, for
  file-writing tools, calls `ctx.setArtifact(path, content)`
  so artifacts surface on `HarnessRun.artifacts`.

#### Scenario: Tool calls tracked through upstream runtime
- **WHEN** a generated eval test runs and the agent calls
  the `Write` tool
- **THEN** the call appears in `toolCalls(result.session)` with
  `{ name: "Write", arguments: {...}, result: {...} }`
- **AND** `result.artifacts[<path>]` contains the file
  content

## REMOVED Requirements

### Requirement: skilletHarness export

**Reason**: Replaced by upstream `piAiHarness`. Skillet
contributes `skilletAgent` and `skilletTools` instead.

**Migration**: Generated eval files import `piAiHarness`
from `@vitest-evals/harness-pi-ai`; the `skilletHarness`
export is gone.
