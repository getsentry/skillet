# Skill Creation Lifecycle

How a skill is built end-to-end. Authoritative reference for the
authoring flow — what runs, in what order, and what gets written.

Load-bearing: keep current as the flow changes. See
`policies/skill-creation-lifecycle.md`.

---

## Commands

- **`skillet create <description>`** — spec-author (interactive) →
  orchestrator (writers + validators). Full from-scratch path.
- **`skillet improve [path]`** — orchestrator runs against the
  current spec.yaml, then vitest. If cases fail, orchestrator runs
  once more with the failing-eval transcripts threaded into
  `skill-writer`'s context.
- **`skillet add-eval [path] "behavior"`** — append one
  behavior/must_not via spec-refine, then orchestrator in
  `add-eval` mode (eval-writer + evals-validator only; SKILL.md
  untouched).
- **`skillet eval [path]`** — vitest run, no generation.
- **`skillet compare <a> <b>`** — run A's evals against A's and
  B's SKILL.md side-by-side.
- **`skillet verify [path]`** — structural agreement of
  spec.yaml + SKILL.md + evals/; `--semantic` adds LLM-judged
  trigger and dimension coverage.

`spec.yaml` is the source of truth. SKILL.md, references, and
evals all derive from it.

---

## Pipeline

```
spec.yaml
        │
        ▼
1. Writer fan-out (parallel)
       │
       ├─ skill-writer  → SKILL.md, references/*.md
       └─ eval-writer   → evals/_judges.ts, evals/<id>.eval.ts, evals/fixtures/<slug>/
        │
        ▼
2. Validator fan-out (parallel, read-only)
       │
       ├─ skill-validator  → diagnostics JSON
       └─ evals-validator  → diagnostics JSON
        │
        ▼
3. Per-pair re-pass on errors (max 1 re-pass per writer)
       │
       ├─ skill-validator returned errors? → skill-writer pass 2 → skill-validator
       └─ evals-validator returned errors? → eval-writer pass 2 → evals-validator
        │
        ▼
4. Done — writers and validators surface findings; user runs
   `skillet eval` for actual test execution.
```

For `skillet improve` after a vitest failure, step 1 re-runs with
`failingEvals` populated; the orchestrator threads the failing
transcripts into `skill-writer`'s `extraContext`. `eval-writer`
does NOT receive failing evals — it leaves existing eval files
untouched (idempotency rule).

`add-eval` runs only the eval-writer + evals-validator pair —
adding an eval doesn't need SKILL.md re-rendered.

---

## Bundled Agents

Skillet ships four Anthropic Agent Skills under `agents/`. Each
is a standard `SKILL.md` + `references/` bundle.

| Agent | Reads | Writes | Returns |
|-------|-------|--------|---------|
| `skill-writer` | spec.yaml, optional validator findings | SKILL.md, references/*.md | terminal text (summary) |
| `eval-writer` | spec.yaml, optional validator findings | evals/_judges.ts, evals/<id>.eval.ts, evals/fixtures/<slug>/ | terminal text (summary) |
| `skill-validator` | spec.yaml, SKILL.md, references/ | nothing | diagnostics JSON |
| `evals-validator` | spec.yaml, evals/ | nothing | diagnostics JSON |

Writers may write under the skill root. Validators are
read-only. No agent gets `bash`. The runner enforces tool
policy and path scoping; out-of-scope reads/writes return tool
errors rather than crashing.

Agents are iterable — edit `agents/<name>/SKILL.md` and the
files in `agents/<name>/references/` to tune authoring quality.
The bundles ship with the npm package via `package.json`'s
`files` array.

---

## Output layout

```
skills/<skill>/
├── SKILL.md              ← skill-writer output
├── spec.yaml             ← source of truth (spec-author / spec-refine only)
├── references/<topic>.md ← skill-writer output (when spec.references[] is non-empty)
└── evals/
    ├── _judges.ts        ← eval-writer output, canonical deduped judges
    ├── fixtures/<slug>/… ← eval-writer output, per-case workspace seeds
    └── <entry-id>.eval.ts ← eval-writer output, one per spec entry
```

---

## Pointers

- Commands: `src/commands/`
- Bundled agents: `agents/`
- Orchestrator: `src/agents/orchestrator.ts`
- Agent runner: `src/agents/runner.ts`
- Diagnostic schema + parser: `src/agents/diagnostics.ts`
- Bundled-agent author entry: `src/agents/author.ts`
  (drives `skillet create` and `skillet improve`)
- Spec-author (interactive, unchanged from prior pipeline):
  `src/authoring/phases/spec-author.ts`
- Public `@sentry/skillet/evals` surface: `src/evals.ts`
- AI queue: `src/agent/queue.ts`
- Spec parser/patcher: `src/spec/`
