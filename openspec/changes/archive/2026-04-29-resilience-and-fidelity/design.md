## Context

Skillet's import → regenerate → eval-gen pipeline destructively rewrites the user's skill directory. When eval-gen takes 8-9 minutes (40+ behaviors) and then fails on malformed JSON, the user is left with a clobbered SKILL.md, a partial spec.yaml, no eval files, and no path back to the original skill except `git checkout`. That's an unacceptable cost for an exploratory `skillet improve ./my-skill` command.

The proximate cause of the 8-9 minute failure is monolithic eval-gen: one LLM call asked to produce N JSON case objects for all N behaviors at once. Response length grows with N; longer responses are more likely to be cut off mid-string, mid-array, or to drift into prose. Three retries doesn't recover from a structural problem with the prompt shape.

Three smaller-but-real correctness issues compound the experience: lost frontmatter on import, fresh skills missing `allowed-tools`, and per-behavior eval prompts unaware of the spec's negative rules. Together they make skillet's output materially worse than the user's existing SKILL.md even when it does pass evals.

The codebase is at v0.23 with no production users; pre-1.0 means we can change file structure and add fields freely.

## Goals / Non-Goals

**Goals:**
- A failure during import / regen / eval-gen leaves the user's skill directory exactly as it was before the command ran. No half-applied state.
- Eval-gen scales to 50+ behaviors. Adding more behaviors slows the wall-clock proportionally (within concurrency caps) but never produces malformed-JSON failures.
- `allowed-tools` and other unknown frontmatter fields survive the import → spec → regen round-trip. New skills via `create` ship with a working `allowed-tools` line by default.
- Eval-gen produces fixtures that don't accidentally trip the skill's own must_not rules.
- When something fails, the user can see WHICH behavior, what the LLM returned, what the validator rejected, and how long each phase took — without re-running with extra flags. (Verbose mode adds raw I/O on top.)

**Non-Goals:**
- Adjacent SPEC.md / EVAL.md ingestion (spec.yaml + .eval.ts is the contract).
- Compare/auth/scoped-import polish.
- The "rewrite vs create asymmetry" — whether improve should preserve the original SKILL.md instead of regenerating. Separate conversation.
- A telemetry/observability backend. Logs go to stderr; that's enough.
- Cross-process atomic writes. Single-process invocation is the only contract.

## Decisions

### 1. Stage-and-swap for transactional writes

**Decision**: Mutating commands (`spec import`, `spec refine`, `improve`, `create`, `add-eval`) write all derived files into a sibling staging directory `<skillRoot>.skillet-staging-<random>/` first. On full success, the staging dir's files are atomically moved into place via per-file `rename`. On any failure, the staging dir is removed and the original skill is unchanged.

The semantics:
- spec.yaml, SKILL.md, and every `evals/<id>.eval.ts` written this run go through staging.
- Files NOT written this run (existing eval files for behaviors that didn't change, references/) are not touched.
- Per-file `rename()` is atomic on POSIX; multi-file groups are not, so the failure window is narrowed but not eliminated. We accept a short window where, say, spec.yaml is updated but SKILL.md isn't yet. A crash there leaves the user able to manually inspect both files.

**Rationale**: The user's loss case is "eval-gen failed and now I have nothing." Stage-and-swap makes that impossible — eval-gen runs against the staging dir, and a failure there means we never touch the live files. The non-atomicity across multiple renames is an acceptable smaller failure window.

**Alternatives considered**:
- `.bak` files alongside the originals: simple but messy (litters the user's directory, requires cleanup on success). Rejected.
- Full git-style transaction with WAL: overkill for a CLI single-process operation. Rejected.

### 2. Per-behavior eval-gen with a cheaper model

**Decision**: `runEvalGen` partitions the spec's behaviors + must_nots into individual entries and issues one LLM call per entry. Calls run via `Promise.all` with a concurrency cap (`p-limit` or hand-rolled, default 6 — eval-gen is i/o bound on the LLM). Each call asks the LLM for a JSON object representing a single eval case (or array of 1-2 cases when natural variations exist). Validation runs per response; failures retry that one entry up to 3 times. Successful entries write their files immediately, so a partial failure leaves N-k files written with k remaining behaviors uncovered (verify-coverage flags them, and the user can re-run).

The model used for eval-gen is configurable via `SKILLET_EVAL_GEN_MODEL`. Default: the judge model (`resolveModels().judge`), which is already a cheap/fast model (Claude Haiku in typical configs). Single-behavior generation is constrained enough that a small model suffices, and the parallelism makes wall-time depend on the cap, not the model speed.

**Rationale**: One call per behavior is the load-bearing change. It eliminates the "long response gets truncated" failure mode. Per-call retries isolate failures so 1 of 40 behaviors failing doesn't reset the other 39. Cheaper model is opportunistic — the prompt is short and structured, so the heavy model is overkill.

Single-behavior fixtures don't suffer from "case order matters" or "remember 40 IDs" cognitive load, which were silent contributors to JSON malformation.

**Alternatives considered**:
- Batches of N (5-10): better than 40-at-once but still subject to size-based malformation as N grows; doesn't isolate failures cleanly. Rejected in favor of N=1.
- Streaming JSON parse: doesn't help because the LLM doesn't always emit valid prefixes. Rejected.
- Use the agent model, just smaller batches: misses the cheap-model opportunity. Rejected.

### 3. `frontmatter_extras` field on the spec

**Decision**: The `SkillSpec` type gains an optional `frontmatter_extras: Record<string, unknown>` field. spec-import populates it from any frontmatter key in the source SKILL.md that isn't `name` or `description`. skill-gen renders it back into the output frontmatter on every regen. The values are passed through unchanged (strings stay strings, lists stay lists).

Validation is permissive: unknown keys with non-string values pass through; spec lint warns on keys that conflict with skillet's reserved names but doesn't fail.

**Rationale**: Round-trip preservation. The spec stays the source of truth for the things skillet knows about; everything else lives in `frontmatter_extras` so regen doesn't lose it. This is structurally similar to how `tests_behavior` rides along on eval cases — opaque metadata pinned to the entry that owns it.

**Alternatives considered**:
- Add explicit fields for known keys (`allowed_tools`, `argument_hint`): brittle as new SKILL.md conventions emerge. Rejected.
- Read frontmatter from the existing SKILL.md at regen time and merge: makes regen non-deterministic in the spec — same spec produces different SKILL.md depending on disk state. Rejected.

### 4. Default `allowed-tools` on `create`

**Decision**: `skillet create` populates `frontmatter_extras: { "allowed-tools": "Read Grep Glob Bash Edit Write" }` for new skills unless the user passes `--no-default-tools` or `--tools "<custom list>"`. The default reflects the common Claude Code subset that covers most authoring workflows; it intentionally excludes destructive/network tools (e.g. `WebFetch`).

The spec-init prompt is updated to mention that `allowed-tools` is set by default and can be overridden, but the LLM does not select tools — that's a flag-driven decision, not a prompt one.

**Rationale**: Most users hit permission prompts on freshly-created skills today and have to manually edit SKILL.md. A safe default with explicit overrides is the right shape. We deliberately don't have the LLM "infer" tools from the skill's intent because that's brittle and the failure mode (skill ships with too few or too many tools) is hard to diagnose later.

**Alternatives considered**:
- LLM-inferred tools per skill: too many false negatives (skill needs `Bash` for one rare case). Rejected.
- No default, force user to pass `--tools`: punishes the common case. Rejected.

### 5. must_not awareness in per-behavior eval-gen

**Decision**: Every per-behavior LLM call receives the spec's full `must_not` list as part of its system prompt, with explicit instruction: "When constructing fixtures (input prompts, setup scripts), make sure none of them would themselves trip the must_not rules below. A positive case must test the behavior under test, not accidentally trigger a different rule."

The prompt explicitly notes that this matters most for skills with sensitive-content rules (privacy, security, redaction) where natural-looking fictional names or strings can collide with rules about handling those exact patterns.

**Rationale**: Cheap fix, narrowly targeted at the observed failure. The full must_not list is small (typical skills have 1-5 entries) and adds modest token cost per call.

**Alternatives considered**:
- Validate fixtures post-hoc against must_nots and reject: requires running the must_not detector on each fixture, which we don't have as a primitive. Rejected.
- Only pass must_nots to behaviors in skills that look "sensitive": fragile and wrong by default. Rejected.

### 6. Structured phase logger

**Decision**: A small `src/log.ts` module exports `phase(name, fn)` and `event(level, msg, payload?)` helpers. Each phase logs `[phase] <name> started`, `[phase] <name> ok in Xms` or `[phase] <name> failed in Xms`. Each event is `[level] <msg>` with optional structured payload as JSON appended on a continuation line when `SKILLET_VERBOSE=1`.

Default-on logs (always emitted to stderr):
- Phase start/end with timing
- Per-behavior eval-gen progress: `eval-gen behavior=<id> attempt=<n> ok=<bool>`
- Failure context when an LLM response fails to parse or validate: short message + 200 chars of the raw response

`--verbose` (or `SKILLET_VERBOSE=1`) adds:
- Full LLM input + output for every call
- Staging dir paths so the user can inspect what would have been written
- Tool-call traces (already partially there for the agent loop)

Logs go to stderr. stdout stays reserved for `--json` output and the human-readable summary.

**Rationale**: Cheap to build, expensive to debug without. Today's logs only print phase boundaries from the regen callback — there's no per-behavior detail and no failure context. The verbose channel is opt-in because raw LLM I/O is bulky and rarely needed for routine runs.

**Alternatives considered**:
- Pino / Winston / a real structured logger: too heavy for a CLI; the format we want is human-readable lines with optional JSON payloads. Rejected.
- Always log full LLM I/O: bloats normal runs. Rejected.

### 7. Module layout

```
src/
  staging/                   # NEW
    index.ts                 # createStagingDir, swapIntoPlace, discardStaging
  log.ts                     # NEW phase + event helpers
  agent/
    provider.ts              # adds resolveModels().evalGen (default: judge model)
  spec/
    types.ts                 # adds frontmatter_extras to SkillSpec
    parser.ts                # parses unknown frontmatter keys into the field
    io.ts                    # renders frontmatter_extras into the spec.yaml banner area
    regen.ts                 # writes go through staging
  authoring/
    phases/
      eval-gen.ts            # per-behavior parallel, partial-success
      skill-gen.ts           # renders frontmatter_extras into SKILL.md
      spec-import.ts         # captures unknown frontmatter into frontmatter_extras
    prompts/
      eval-gen.ts            # single-behavior shape with must_not context
  commands/
    create.ts                # --tools, --no-default-tools, sets default frontmatter_extras
    spec.ts                  # spec import wraps regen in staging
    improve.ts               # similarly transactional
  cli.ts                     # --verbose plumbing + tools flag parsing
```

## Risks / Trade-offs

- **[Per-behavior parallel calls multiply LLM costs]** → 40 calls vs 1 call is 40x quota usage on the bill. Mitigated by using the judge (cheap) model and capping concurrency. Net cost is dominated by the wall-clock you save (failure runs cost ~$X today; with retry-only-failed they cost ~$X/40).

- **[Staging dir persists on hard crash]** → If the process dies mid-swap, the staging dir lingers. Mitigated by including a timestamp/PID in the dir name and adding a `--clean` subcommand later. Live skill is unchanged either way.

- **[Concurrency cap doesn't perfectly bound provider rate limits]** → 6 concurrent eval-gen calls in parallel with the agent's own concurrency in the eval phase could trip provider limits. Mitigated by separate roles (eval-gen runs synchronously to its caller — only one phase running at a time per skillet invocation; the agent loop waits for eval-gen to finish before running evals).

- **[`frontmatter_extras` becomes a junk drawer]** → Future skillet features that want a real schema for some currently-extras key will need a migration path. Mitigated by treating extras as forward-compatible: when skillet learns about a new key (say it adds first-class `allowed_tools` later), the parser promotes it from `frontmatter_extras` to the typed field and the renderer drops it from extras.

- **[Verbose logs leak secrets]** → Raw LLM I/O can include user API keys if those leaked into the prompt. Mitigated by skillet's existing credential-stripping in `sanitizedProcessEnv()` (used for workspace setup) and a similar redact pass on logged prompts. Worst case the user runs `--verbose` only when debugging and reviews output before pasting it.

- **[Default tool list is wrong for some skills]** → A "review only" skill doesn't need `Write` or `Bash`. Mitigated by `--tools "..."` override and the option for the spec-init prompt to suggest a tighter set in the body of SKILL.md. The default is "permissive enough that things work"; tightening is the user's job.
