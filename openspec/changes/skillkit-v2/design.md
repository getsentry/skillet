## Context

Skillkit is currently a ~800 LOC TypeScript CLI that can run YAML-defined eval cases against a skill's SKILL.md. It has a built-in agent runtime (pi-ai + bash/read/write/edit/list/grep tools), structural checks, and an LLM-as-judge. The `create` and `iterate` commands are stubs.

The codebase needs to support two new agentic workflows (create, improve) while keeping the existing eval-only path intact. The LLM layer was just migrated from Vercel AI SDK to `@mariozechner/pi-ai`.

Key external references:
- **skill-writer** (getsentry/skills): Defines quality standards for skill authoring — patterns, depth gates, source synthesis, description optimization.
- **vitest-evals** (getsentry/vitest-evals PR #41): Defines the normalized result format (NormalizedSession, HarnessRun, UsageSummary) that skillkit's eval output should align toward.

## Goals / Non-Goals

**Goals:**
- `skillkit create` and `skillkit improve` as agentic commands that use an LLM to author/refine skills and generate evals
- `create` and `improve` share a core loop; `create` is `improve` with no pre-existing SKILL.md
- `skillkit eval --json` for structured output consumable by other agents
- `skillkit validate` for cheap structural pre-flight checks
- Eval result format shaped toward vitest-evals compatibility
- Skill-writer quality knowledge ships as bundled reference material inside skillkit

**Non-Goals:**
- Using vitest-evals as a runtime dependency (future work)
- Using pi-agent-core for the agent loop (future simplification)
- TUI / interactive terminal UI (not needed — consumers are agents or CI)
- Hosting, cloud execution, or remote eval services
- Supporting non-YAML eval formats (TypeScript eval files are vitest-evals territory)

## Decisions

### 1. `create` and `improve` are the same command internally

**Decision**: Both route to a shared `authorSkill()` function. The only difference is whether SKILL.md exists at the target path. `create` errors if SKILL.md already exists; `improve` errors if it doesn't. Both could eventually alias to a single `skillkit author` command, but having distinct names makes intent clear for now.

**Alternatives considered**:
- Single `skillkit author` command that auto-detects: Too clever, unclear intent when SKILL.md has a bug and doesn't parse.
- Separate codepaths: Unnecessary duplication — the loop is identical after initialization.

### 2. Authoring loop structure

**Decision**: The authoring loop is a multi-phase pipeline:

```
describe → generate SKILL.md → generate evals → run evals → assess → iterate
                                                                │
                                                    ◄───────────┘
                                                   (if quality bar not met)
```

Each phase is a separate LLM call with focused system prompts and the relevant skill-writer reference material. The loop runs a configurable number of iterations (default: 3) or until all evals pass.

**Rationale**: Focused single-purpose LLM calls produce better results than one monolithic "do everything" prompt. Each phase can include only the reference material it needs (skill patterns for generation, eval examples for eval authoring, etc.).

### 3. Skill-writer knowledge ships as static reference files

**Decision**: Bundle key skill-writer reference material (skill patterns, authoring guidance, eval examples) as static files inside the skillkit npm package under `references/`. These are loaded and injected into system prompts during authoring.

**Alternatives considered**:
- Hardcoded prompt strings: Harder to maintain, can't be inspected or overridden.
- Fetch from remote: Adds network dependency, breaks offline use.
- Require user to have skill-writer skill installed: Defeats the "zero dependency" goal.

### 4. Eval result format: vitest-evals-shaped but standalone

**Decision**: Define TypeScript types that mirror vitest-evals' `NormalizedSession`, `UsageSummary`, `HarnessRun` shapes. Don't import from vitest-evals — just keep the shapes compatible. JSON output uses these types.

```
EvalCaseResult {
  name, status,
  session: { messages: NormalizedMessage[], outputText? },
  usage: { toolCalls?, totalTokens?, provider?, model? },
  checks: CheckResult[],
  judge?: { grade, score, reasoning },
  errors: ErrorRecord[]
}
```

**Rationale**: When vitest-evals integration happens later, the shape is already right — it's a type alignment, not a data restructure.

### 5. `validate` is pure structural checks, no LLM

**Decision**: `validate` is fast and free — checks frontmatter parsing, required fields, eval file parsing, file references. No LLM calls. Returns structured errors.

**Rationale**: Useful as a pre-flight before expensive eval runs. Agents can call `validate` first, fix structural issues, then `eval`.

### 6. Module layout

```
src/
  cli.ts                    # dispatch
  commands/
    create.ts               # -> authorSkill(mode: 'create')
    improve.ts              # -> authorSkill(mode: 'improve')
    eval.ts                 # existing, add --json
    validate.ts             # new
  authoring/
    loop.ts                 # authorSkill() orchestrator
    prompts.ts              # system prompts for each phase
    eval-gen.ts             # eval case generation from skill
  agent/                    # unchanged (eval execution engine)
    provider.ts
    loop.ts
    tools.ts
  eval/                     # mostly unchanged
    parser.ts
    runner.ts               # result types update
    checks.ts
    judge.ts
    workspace.ts
    requirements.ts
  skill/
    loader.ts               # unchanged
    validator.ts            # new: structural validation
  output/
    json.ts                 # JSON serialization for --json
    pretty.ts               # existing ANSI output, extracted
references/                 # bundled skill-writer knowledge
  skill-patterns.md
  authoring-guidance.md
  eval-examples.md
```

## Risks / Trade-offs

**[LLM-generated evals may be low quality]** → Mitigated by the iterative loop — bad evals surface as failures, which the authoring agent sees and corrects. Also mitigated by providing eval examples in reference material.

**[Authoring loop may be expensive]** → Each `create`/`improve` run makes multiple LLM calls across iterations. Mitigated by capping iterations (default 3) and by `validate` catching cheap errors before LLM runs. Users can also set `--max-iterations 1` for a single pass.

**[Bundled reference material becomes stale]** → The skill-writer knowledge is a snapshot. Mitigated by keeping references focused on stable principles (patterns, not specific APIs) and versioning them with skillkit releases.

**[vitest-evals format may drift]** → We're aligning to a shape from a draft PR. Mitigated by keeping the alignment loose (compatible shapes, not shared types) so we can adjust without breaking.
