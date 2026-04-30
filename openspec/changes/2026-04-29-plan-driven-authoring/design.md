# Design

## Plan vs Spec

A plan is just an underspecified spec. We do not introduce a separate Plan
artifact. The spec is the contract; the author loop is how we negotiate it with
the user. Authoring-time state (sources, decisions, coverage matrix, open
questions) lives in the conversation, not on disk.

This is deliberately different from openspec itself, which separates
proposal/design/tasks: openspec is documenting human-driven changes to a
codebase. We are documenting a machine-driven contract for code generation.
The spec is small and direct enough that the author loop can fully fill it out
in dialogue without a separate planning artifact.

## Skill Classes

Five classes, declared in code:

| Class             | Required behavior dimensions                                                            | Required references (`topics` includes)                          |
|-------------------|-----------------------------------------------------------------------------------------|------------------------------------------------------------------|
| `workflow`        | preconditions, ordered steps, failure handling, safety boundaries                       | none required; references optional                                |
| `integration`     | API surface, common use cases, troubleshooting/known-issues                              | `api-surface`, `use-cases`, `troubleshooting`                    |
| `security-review` | vulnerability classes, investigation workflow, false-positive controls, severity calibration, neighboring-class boundaries | `vulnerability-patterns`, `false-positive-traps`, `remediations` |
| `authoring`       | source provenance handling, depth gates, transformed examples, registration/validation  | `examples/happy-path`, `examples/anti-pattern`                    |
| `generic`         | dimensions chosen explicitly during author loop, justified in dialogue                  | none required                                                     |

`generic` is an escape hatch and the author loop will push back if a skill that
fits a real class is being filed under generic.

The required-references contract uses the existing `references[]` field's
`topics`. No new spec field for examples is needed: a transformed example is
just a reference whose `topics` includes `example:happy-path` (or similar).
Generation already knows how to materialize references.

## Spec-Author Loop

Multi-turn dialogue between the LLM and the user. Each turn:

1. **Propose** — LLM proposes a spec delta (initial draft on turn 1, refinement
   thereafter).
2. **Critique** — class-driven validator runs against the current spec. Reports
   missing dimensions, missing required references, and any structural issues.
3. **Question or commit** — if validator fails, the LLM either asks the user
   targeted questions to fill gaps OR proposes its best guess (clearly marked)
   and asks the user to confirm. If validator passes, the LLM presents the
   final spec to the user and asks for explicit acceptance.

The loop terminates when the user accepts a validator-passing spec.

The `improve` and existing-skill seed strategies start the loop with a
non-empty spec; the user may accept on turn 1 if the seeded spec already
passes gates and matches their intent.

## Seed Strategies

`src/spec/seed/` houses three small modules that produce an initial draft spec:

- `from-description.ts` — LLM call: description → draft spec. Class is
  inferred and proposed; user confirms or overrides in the author loop.
- `from-skill.ts` — Parses an existing SKILL.md + references and reverse-
  derives a draft spec (behaviors from headings, references from `references/`,
  class inferred from frontmatter or content).
- `from-improve.ts` — Reads the current spec plus eval failure transcripts and
  proposes a delta (new behaviors, new references, modified existing ones).

All three emit the same `Spec` type. The author loop is identical from there.

## Interactive Transport

The CLI command surfaces the loop with TTY detection:

- LLM emits structured turn output: `{ patches: SpecPatch[], questions:
  string[], commit_request?: boolean }`.
- The transport interface is `presentTurn`, `askQuestions(qs[])`, `askAccept`.
  The loop calls `askQuestions` with the full batch so questions can be
  surfaced together.
- **TTY mode**: blocking readline. Each question is asked and answered inline;
  the answers are fed back as a single user turn for the next LLM call.
- **Non-TTY mode** (the agent-harness path, the primary non-TTY consumer):
  the transport throws `PausedForAnswers(questions[])` instead of blocking.
  The author loop wraps it as `SpecAuthorPaused(questions, spec, messages)`,
  carrying the full state needed to resume. The calling command catches that,
  writes `<skillRoot>/.skillet-session.json`, prints the questions to stderr
  with a `skillet resume` hint, and exits with code 2.

The session file shape:

```ts
interface SpecAuthorSession {
  version: 1;
  skillRoot: string;
  seedKind: "from-description" | "from-skill" | "from-improve";
  seedInput?: string;          // description or SKILL.md, for diagnostics
  spec: SkillSpec;
  messages: Message[];          // full LLM conversation up to the pause
  pendingQuestions: string[];   // answers must match this length on resume
  allowedTools?: string;
}
```

`skillet resume <path> --answer "..."` is a new top-level command. It reads
the session, validates that `--answer` count matches `pendingQuestions.length`,
and re-enters `runSpecAuthor` with `resume: { messages, pendingAnswers }`.
The loop pre-feeds the answers as a user turn and resumes. On accept, the
session is deleted and regen runs as usual; on another pause, the session is
rewritten with the new questions.

No `PhaseInterruptedForHumanInput` exception-as-control-flow. The questions
are part of the normal turn return value, and the pause mechanism is the
typed transport behavior, not a hidden side effect.

## Depth Gates

Class definitions are pure data. The validator is small:

```ts
function validateClassGates(spec: Spec): ValidationResult {
  const def = CLASSES[spec.class];
  return {
    missingDimensions: def.requiredDimensions.filter(d =>
      !spec.behaviors.some(b => b.dimensions?.includes(d))),
    missingReferences: def.requiredReferenceTopics.filter(t =>
      !spec.references.some(r => r.topics.includes(t))),
  };
}
```

Behaviors gain an optional `dimensions: string[]` field used only by the
validator — this is the second tiny spec change (alongside `class`). It is
optional because `workflow` and `generic` skills do not require it.

Two new fields total: `class` (required) and `dimensions` on each behavior
(optional). No coverage matrix, no decisions log, no sources field.

## Deletions

- `src/authoring/phases/spec-init.ts`
- `src/authoring/phases/spec-import.ts`
- `src/authoring/prompts/spec-init.ts`
- `src/authoring/prompts/spec-import.ts`
- `PhaseInterruptedForHumanInput` exception class and its handlers
- `src/plan/` (empty placeholder dir)

`src/authoring/phases/spec-refine.ts` stays — it is the prompt for
post-acceptance edits via `skillet spec refine` and is independent of the
author loop.

## Risks and Alternatives

**Risk: Author loop feels chatty.** Mitigation: validator-based termination
means a clear spec from a clear description finishes in one turn. The loop
only escalates when gates fail.

**Risk: Class taxonomy is too coarse.** Mitigation: class definitions are pure
data in `src/spec/classes.ts` and easy to refine over time; `generic` exists
as an escape hatch.

**Alternative considered: persist `SOURCES.md` like skill-writer.** Rejected
for v1 — it is a sidecar concern and adds a second source of truth. Can be
added later without changing this change's contract.

**Alternative considered: keep `spec-init` and `spec-import` as separate
phases.** Rejected — they currently differ only in `frontmatter_extras`
capture and the seed step. Unifying them on a single author loop with three
seed dispatchers eliminates the duplication.
