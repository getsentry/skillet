## Decision

Reshape skillet into orchestration software for four bundled
agents. Each agent is an Anthropic Agent Skill (SKILL.md +
references/) shipped inside skillet's npm package. The
orchestrator runs agents through `pi-agent-core`'s `runAgentLoop`
(same primitive `skilletAgent` already uses for evals), persists
their outputs, and routes diagnostics between them.

## Agent Roster

| Agent | Reads | Writes | Returns |
|-------|-------|--------|---------|
| `spec-author` (existing, unchanged) | description / SKILL.md / `--input` paths | `spec.yaml` | turn output JSON (patches/questions/commit_request) |
| `skill-writer` | `spec.yaml`, optional validator diagnostics | `SKILL.md`, `references/*.md` | terminal text (success summary) |
| `eval-writer` | `spec.yaml`, optional validator diagnostics | `evals/_judges.ts`, `evals/<id>.eval.ts`, `evals/fixtures/<slug>/` | terminal text (success summary) |
| `skill-validator` | `spec.yaml`, `SKILL.md`, `references/` | nothing | structured diagnostics JSON |
| `evals-validator` | `spec.yaml`, `evals/` | nothing | structured diagnostics JSON |

Writers have read+write tools scoped to their output paths.
Validators have read-only tools. Spec is read-only to writers
and validators — only spec-author and `skillet spec refine`
mutate `spec.yaml`.

## Diagnostic Schema

Validators emit a single JSON object as their final assistant
message. Convention: the orchestrator parses the LAST fenced
JSON block in the agent's terminal output.

```json
{
  "ok": false,
  "findings": [
    {
      "severity": "error" | "warning" | "info",
      "subject": "behavior:<id>" | "must_not:<id>" | "skill" | "evals" | "reference:<path>",
      "kind": "missing-coverage" | "drift" | "voice" | "depth" | "structural" | "judge-dedup" | "fixture" | "other",
      "message": "<one-line summary>",
      "suggestion": "<optional concrete fix recommendation>"
    }
  ]
}
```

Diagnostics are advisory inputs to the next writer pass — never
applied directly. The orchestrator hands the full diagnostics
JSON back to the writer as added context: "Validator returned
the following findings; address them in your re-pass."

`ok: true` with empty findings stops the loop for that
writer/validator pair. `ok: false` triggers exactly one re-pass
of the writer; if the second validator pass still returns
`ok: false`, the orchestrator stops, writes a final report, and
exits non-zero (CLI surface decides whether to fail loudly or
warn).

## Orchestrator Contract

```ts
interface OrchestratorOptions {
  skillRoot: string;
  mode: "create" | "improve";
  description?: string;
  inputPaths?: string[];
  failingEvals?: EvalRunResult; // populated when called from improve loop
  maxRePassesPerWriter?: number; // default 1
}

interface OrchestratorResult {
  skillRoot: string;
  agentsRun: AgentRunRecord[];
  diagnostics: { skill: Diagnostics; evals: Diagnostics };
  success: boolean;
}

const orchestrate: (opts: OrchestratorOptions) => Promise<OrchestratorResult>;
```

Sequence:

1. **Establish spec.** `create` mode: seed-from-description →
   spec-author dialogue → spec.yaml (unchanged from today).
   `improve` mode: spec.yaml exists; if not, fall back to
   seed-from-skill flow (also unchanged).
2. **Writer fan-out (parallel).** Run `skill-writer` and
   `eval-writer` concurrently, each scoped to its own output
   directory. Failing-eval context (if any) goes to skill-writer.
3. **Validator fan-out (parallel).** Run `skill-validator` and
   `evals-validator` against the writer outputs.
4. **Re-pass routing.** For each validator returning `ok: false`,
   re-run the corresponding writer with the diagnostics. After
   one re-pass, re-run the validator. If still `ok: false`,
   surface findings and stop.
5. **Return.** Orchestrator's job ends here. `skillet eval`
   runs vitest separately. `skillet improve` re-enters the
   orchestrator with `failingEvals` populated; same path with
   added context.

Spec-author, skill-writer, and eval-writer are independent steps;
the writer-validator-rewriter cycle is the loop. The orchestrator
does not interleave (e.g., skill-validator findings do not
trigger eval-writer re-passes — each writer-validator pair runs
independently).

## Agent Runner

Single primitive: `runAgent(agent, ctx)`.

```ts
interface AgentDefinition {
  name: string;
  /** Path to bundled agent skill directory inside skillet. */
  bundleRoot: string;
  /** Tool budget per turn. */
  maxToolCalls?: number;
  /** Tool surface — read-only or read+write, with path scope. */
  tools: AgentToolPolicy;
}

interface AgentRunContext {
  skillRoot: string;
  /** Inputs the agent reads (directories it can read_file/list_files/grep against). */
  readScope: string[];
  /** Output paths the agent may write to. Empty for validators. */
  writeScope: string[];
  /** Free-form context appended to the system prompt (e.g. failing evals, validator findings). */
  extraContext?: string;
  signal?: AbortSignal;
}

const runAgent: (agent: AgentDefinition, ctx: AgentRunContext) =>
  Promise<{ terminalText: string; toolCalls: number }>;
```

Implementation reuses `pi-agent-core`'s `runAgentLoop` (already in
use by `skilletAgent`). System prompt = the agent's bundled
SKILL.md body + an "Operating context" footer the orchestrator
appends (skill root path, read scope, write scope, extra
context). Tools come from `src/agent/tools.ts` (existing
`createToolDefs`), filtered/scoped by policy.

## Why this shape (vs. alternatives)

**vs. one mega-agent that does everything:** four agents lets
each one own a tight slice with a focused SKILL.md. skill-writer
and eval-writer have very different reference loads (skill-writer
needs design-principles + reference-architecture + description-
optimization; eval-writer needs the eval contract, judge naming,
fixture conventions). Forcing both into one agent's context is
expensive and dilutes signal.

**vs. validator agents that auto-edit:** diagnostic-only is the
simpler model. The writer is the thing that knows how to write;
asking the validator to also know how to write doubles the
authoring surface. Validators can stay tightly focused on
critique; writers stay focused on production.

**vs. eliminating the eval-pass-driven improve loop:** the user
explicitly asked to keep it. After `skillet eval` runs, on
failure `skillet improve` re-enters the orchestrator with the
failing-eval result; skill-writer gets the failures as added
context (and skill-validator can flag drift between rule-text
and what passed/failed). No separate skill-improve code.

**vs. keeping the 5-stage eval-gen pipeline as a fast path:**
the determinism that pipeline buys (canonical judge dedup,
fixture extraction, render templates) becomes the eval-writer
agent's responsibility, encoded in its SKILL.md + references.
Lose some guarantee, gain agency. evals-validator catches the
deterministic-style failures (orphan judges, judge-naming drift,
fixture-without-helper-call) and routes them back. Net: same
outcome, fewer code paths.

## Tools Per Agent

| Agent | bash | read_file | write_file | edit_file | list_files | grep |
|-------|------|-----------|------------|-----------|------------|------|
| spec-author | — | ✓ | — | — | ✓ | ✓ |
| skill-writer | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| eval-writer | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| skill-validator | — | ✓ | — | — | ✓ | ✓ |
| evals-validator | — | ✓ | — | — | ✓ | ✓ |

No agent gets `bash`. The eval-writer doesn't run vitest itself —
the orchestrator runs it after writers/validators converge.

## What stays the same

- `spec.yaml` schema (`src/spec/`) — source of truth, no changes
- `src/eval/vitest-runner.ts` — vitest invocation
- `src/evals.ts` public surface and `src/evals/*` — consumers
  (generated `.eval.ts` files) keep importing from
  `@sentry/skillet/evals`. Eval-writer must produce files
  conforming to that surface.
- `src/agent/queue.ts` — the AI queue. Still throttles parallel
  LLM calls. Each agent's tool calls stay within its own
  pi-agent-core loop; the queue's role narrows to inter-agent
  parallelism (skill-writer + eval-writer running concurrently,
  validators running concurrently).
- Structural verification (`src/verify/structural.ts`) — pre-flight
  schema checks before agents run.

## Risks

1. **Quality regression on first cut.** Today's pipeline produces
   working skills. Replacing it with agentic writers means the
   first iteration's output may be worse before the SKILL.md +
   reference content matures. Mitigation: keep clean-room regen
   of `wrdn-authz` and `wrdn-gha-workflows` as the gate before
   landing — judge by reading the artifacts, not by structural
   diffs.
2. **Validator-writer ping-pong.** Diagnostics that trigger a
   re-pass that produces new diagnostics. Mitigation: hard cap
   of 1 re-pass per writer per cycle. If validator still
   complains, surface and stop. Don't burn budget on noise.
3. **Eval-writer one-shotting a 30-behavior suite.** Today's
   per-entry fan-out lets the model focus on one behavior at a
   time. The eval-writer has to hold all 30 in context. The
   skill-writer agent in `getsentry/skills` already does this
   shape for SKILL.md routing tables, so the pattern is proven
   on the writing side; eval-gen is denser content but still
   bounded. Mitigation: judge dedup and fixture extraction live
   in the agent's prompt. If quality drops, the agent's
   reference files (`eval-contract.md`,
   `judge-naming.md`, `fixture-conventions.md`) are where to
   tune — not phase code.
4. **Loss of incremental eval-gen.** Today's pipeline can
   regenerate evals for one behavior without touching the
   others. Eval-writer rewrites the suite. Mitigation: idempotency
   through eval-writer's SKILL.md ("if `evals/<id>.eval.ts`
   exists and the spec entry hasn't changed, leave it
   untouched"). Existing-file preservation moves into the
   agent's instructions instead of phase logic. A determined
   agent can still smush; if that becomes a real problem,
   fall back to skipping behaviors with existing eval files
   from the eval-writer's input scope.
5. **Bundled agent files growing the npm package.** The
   skill-writer agent pulls in ~22 reference files. Mitigation:
   trim to the references skillet-generated skills actually
   need before vendoring. Skillet won't ship every shape
   skill-writer covers — the eval-pipeline-style shapes
   (`asset-template`, `argument-driven`) may be dropped if
   skillet doesn't intend to generate those.

## Migration

Hard cutover. Per AGENTS.md "Prefer hard cutover over
backwards-compat shims unless the change crosses a published
surface." This change does not cross the published `@sentry/
skillet/evals` surface (eval files are unchanged) or the CLI
surface (commands keep their names and effects). The internal
pipeline is what flips.

Implementation order matters: write and bundle the agents first
(no behavior change yet), wire the orchestrator skeleton
gated behind a `SKILLET_ORCHESTRATOR=1` env var, validate
on warden skills, then flip the default and delete the old
phases in the same commit. The env var goes away on cutover.

## Open Questions

1. Where should bundled agents physically live? Two options:
   `<repo>/agents/<name>/` or `<repo>/skills/<name>/` — the
   latter overlaps semantically with `skills/skillet/` (the
   skill skillet evals against itself). Going with `agents/`
   to keep the namespaces distinct.
2. Should `skill-validator` block `skillet improve` when its
   findings are warnings only? Default no — only `error`-level
   findings drive a writer re-pass; warnings surface in the
   final report.
3. Do we want a fast `skillet refresh` command that runs only
   the writers (no validators) for quick re-rendering? Defer.
   Decide based on usage patterns post-cutover.
