## Tasks

### Phase 0 — Infrastructure

- [ ] Define `AgentDefinition`, `AgentRunContext`, and
      `Diagnostics` shapes in `src/agents/types.ts`.
- [ ] Implement `runAgent(agent, ctx)` in `src/agents/runner.ts`
      on top of `pi-agent-core`'s `runAgentLoop`. Reuse
      `createToolDefs` from `src/agent/tools.ts`; filter by
      agent's tool policy; scope file-tool paths to
      `readScope` ∪ `writeScope`.
- [ ] Implement diagnostic parsing in
      `src/agents/diagnostics.ts` — extract the LAST fenced
      JSON block in terminal text, validate against schema,
      surface a clear error if absent or malformed.
- [ ] Implement orchestrator in `src/agents/orchestrator.ts`
      with the writer-fanout → validator-fanout → re-pass
      sequence from `design.md`. Cap re-passes per writer at
      1 by default.
- [ ] Wire `SKILLET_ORCHESTRATOR=1` env-var gate so the new
      path can run alongside the old phases during validation.

### Phase 1 — Bundle skill-writer

- [ ] Vendor `getsentry/skills/skills/skill-writer/` into
      `agents/skill-writer/`. Trim references to those
      skillet-generated skills can plausibly need (drop
      `asset-template`, `argument-driven`, `hook-backed`,
      `subagent-fork` layouts unless we plan to generate
      those shapes).
- [ ] Modify `agents/skill-writer/SKILL.md` to read `spec.yaml`
      as input and produce `SKILL.md` + `references/*.md` as
      output. Drop SPEC.md production. Drop the synthesis-path
      pieces that overlap with spec-author (source collection,
      class gates) — those live in spec-author, not
      skill-writer.
- [ ] Add an "Operating context" footer to
      `agents/skill-writer/SKILL.md` describing the orchestrator
      surface (what gets passed in extraContext, where to write,
      how to terminate).
- [ ] Snapshot test: run skill-writer agent against
      `skills/skillet/spec.yaml` under
      `SKILLET_ORCHESTRATOR=1`; eyeball SKILL.md vs. current
      output.

### Phase 2 — Bundle eval-writer

- [ ] Author `agents/eval-writer/SKILL.md`. Imperative voice,
      router-style for the evals/ tree.
- [ ] Move `_code-eval-contract.ts` content into
      `agents/eval-writer/references/eval-contract.md`. Same
      content, agent-readable. Keep the regex/substring ban,
      assertion-shape preference order, judge naming
      conventions, per-file caps, fixture format.
- [ ] Add `agents/eval-writer/references/judge-dedup.md`:
      canonical judge names, "default to reuse" rule, naming
      stems table from the existing prompt content.
- [ ] Add `agents/eval-writer/references/fixture-conventions.md`:
      `evals/fixtures/<slug>/` layout, `createWorkspace` usage,
      no-shell-setup rule.
- [ ] Add `agents/eval-writer/references/idempotency.md`:
      "skip behaviors whose `evals/<id>.eval.ts` already exists
      unless the spec entry changed".
- [ ] Snapshot test: run eval-writer against
      `skills/skillet/spec.yaml` under
      `SKILLET_ORCHESTRATOR=1`; verify generated files
      typecheck, lint, run.

### Phase 3 — Bundle validators

- [ ] Author `agents/skill-validator/SKILL.md`. Diagnostic-only
      contract: read spec + skill artifacts, emit JSON. Bundle
      checklist references for: behavior-section coverage,
      must_not coverage, imperative voice, depth, trigger
      phrases in description, reference routing.
- [ ] Author `agents/evals-validator/SKILL.md`. Diagnostic-only.
      Bundle checklist references for: 1:1 spec→eval coverage,
      structural-vs-judge balance, judge dedup, fixture sanity,
      assertion-shape compliance.
- [ ] Add a worked example of a diagnostics JSON in each
      validator's SKILL.md so the agent has a clear template
      for the terminal output.

### Phase 4 — Wire orchestrator into commands

- [ ] `src/commands/create.ts`: when
      `SKILLET_ORCHESTRATOR=1`, route to
      `orchestrate({ mode: "create", description, inputPaths })`
      after spec-author commits the spec.
- [ ] `src/commands/improve.ts`: when
      `SKILLET_ORCHESTRATOR=1`, route to
      `orchestrate({ mode: "improve", failingEvals })` (the
      latter populated only after a vitest run that produced
      failures).
- [ ] `src/commands/add-eval.ts`: when
      `SKILLET_ORCHESTRATOR=1`, after spec-refine commits the
      new entry, run the orchestrator with eval-writer + evals-
      validator only (skill-writer + skill-validator skipped —
      adding an eval doesn't need the SKILL.md re-rendered).
- [ ] Verify `skillet verify` keeps its structural pass; route
      `skillet verify --semantic` through the validator agents
      when the env var is set.

### Phase 5 — Validation against real skills

- [ ] Skillet's own evals: `dist/cli.js eval skills/skillet`
      passes 22/22 cases under
      `SKILLET_ORCHESTRATOR=1`. If not, iterate on the agent
      reference files until it does.
- [ ] Clean-room regen `wrdn-authz` from warden under the new
      pipeline. Compare resulting SKILL.md, spec.yaml, and
      evals/ to the current 0.27.0 output. Land if quality is
      ≥ current.
- [ ] Clean-room regen `wrdn-gha-workflows`. Same gate.

### Phase 6 — Cutover

- [ ] Make the orchestrator path the default. Remove the
      `SKILLET_ORCHESTRATOR` env-var gate.
- [ ] Delete `src/authoring/phases/{skill-gen,skill-improve,
      reference-gen,eval-gen,eval-gen-types,eval-gen-render,
      eval-gen-write,eval-gen-audit,eval-gen-consolidate,
      eval-gen-edits}.ts`.
- [ ] Delete `src/authoring/prompts/{skill-gen,skill-improve,
      reference-gen,eval-gen,eval-gen-audit-suite,
      eval-gen-verify,_code-eval-contract,_spec-output-format}
      .ts` (preserve `spec-author.ts`,
      `seed-from-description.ts`, `seed-from-skill.ts`).
- [ ] Delete `src/authoring/loop.ts`. Move the spec-author
      bootstrap (seed → dialogue) into a small
      `src/authoring/spec-author.ts` entry; orchestrator calls
      it directly.
- [ ] Delete `src/authoring/references.ts` if no remaining
      consumers (the bundled `references/` directory at repo
      root may also retire — check whether spec-author's prompt
      still pulls from it).
- [ ] Update `LIFECYCLE.md`: rewrite the pipeline section
      around the agent roster + orchestrator flow.
- [ ] Update `AGENTS.md` Architecture Discipline section.
- [ ] Update `policies/skill-creation-lifecycle.md`.
- [ ] `npm run check` clean.
- [ ] `npx openspec validate 2026-05-04-agent-orchestration --strict`.
- [ ] Commit + push to main.

### Phase 7 — Archive

- [ ] After landing and a full eval cycle, move the change to
      `openspec/changes/archive/` and update the active
      `skill-authoring` spec under `openspec/specs/` to
      reflect the new shape.
