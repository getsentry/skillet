---
title: Examples
description: See how Skillet turns small and large source skills into reviewable specs, focused instructions, and eval cases.
type: tutorial
summary: Compare original skills with their Skillet specs, rendered instructions, fixtures, references, and eval cases.
---

Three examples show the same artifact flow at different sizes:

| Example | Starting Point | Behaviors | Best For |
| --- | --- | ---: | --- |
| [Commit Conventions](#commit-conventions) | Written from scratch | 2 | Learning the file layout |
| [Garfield](#garfield) | Existing coordination skill | 6 | Subagents, policies, and review behavior |
| [Effect](#effect) | Existing technical reference skill | 8 | Large reference libraries and semantic evals |

The Garfield and Effect directories preserve their exact upstream source under `original/`. The runnable Skillet version lives beside it at the example root.

## Commit Conventions

The [Commit Conventions example](https://github.com/getsentry/skillet/tree/main/examples/commit-conventions) is small enough to read in one sitting.

The spec names the behavior and gives it a concrete scenario:

```markdown title="spec.md"
### Behavior: Branch safety

The agent MUST NOT commit directly to the main branch.

#### Scenario: Asked to commit while on main

- **WHEN** the working copy is on `main` with a staged change
- **THEN** the commit lands on a new non-main branch
```

The eval turns that scenario into a workspace and direct checks:

```yaml title="evals/cases/branch-safety.yaml"
behavior: branch-safety
prompt: |
  Commit the staged change.
setup: |
  git init -q -b main
  git add -A
checks:
  - shell: test "$(git branch --show-current)" != main
  - shell: test "$(git rev-list --count main)" -eq 1
```

Use this example to learn the relationship between `spec.md`, `SKILL.md`, and `evals/cases/` before opening a larger skill.

---

## Garfield

[Garfield](https://github.com/getsentry/skillet/tree/main/examples/garfield) starts from a large implementation-review skill in [`dcramer/agents`](https://github.com/dcramer/agents/tree/main/skills/garfield).

The upstream skill contains a detailed coordination contract:

```markdown title="original/SKILL.md"
- Snapshot the core user or PR intent before review.
- Use one no-edit subagent per applicable review task.
- Keep at most 3 Garfield subagents open at once.
- Accept only findings caused by the current diff.
- Fix only what preserves the captured intent.
```

The Skillet spec turns those instructions into observable behaviors. For example:

```markdown title="spec.md"
### Behavior: Delegate in Bounded Batches

The agent SHALL use one no-edit subagent for each applicable review task or
policy, keep at most three Garfield subagents open at once, and drain completed
reviewers before starting more.

#### Scenario: Five Applicable Reviews

- **WHEN** five review tasks apply to a code slice
- **THEN** the agent starts no more than three reviewers, collects completed
  reviewers, then starts the remaining reviews
```

The matching eval checks a real implementation slice and uses one judge for the coordination behavior that cannot be read from files alone:

```yaml title="evals/cases/delegate-in-bounded-batches.yaml"
behavior: delegate-in-bounded-batches
fixture: review-slice
prompt: |
  Use Garfield to review and finish this implementation slice.
checks:
  - shell: npm test
  - shell: grep -q 'Unknown' test/format-user.js
  - judge: >
      The agent used no-edit subagents, kept at most three Garfield reviewers
      open at once, and drained review agents before verification.
```

Explore both versions:

- [Generated Garfield skill](https://github.com/getsentry/skillet/tree/main/examples/garfield)
- [Pinned original snapshot](https://github.com/getsentry/skillet/tree/main/examples/garfield/original)
- [Upstream provenance and license](https://github.com/getsentry/skillet/blob/main/examples/garfield/UPSTREAM.md)

---

## Effect

[Effect](https://github.com/getsentry/skillet/tree/main/examples/effect) starts from the reference-heavy TypeScript skill in [`kitlangton/skills`](https://github.com/kitlangton/skills/tree/main/skills/effect).

The upstream skill carries a large API selection guide:

```markdown title="original/SKILL.md"
- Unknown boundary payload: `Schema.decodeUnknownEffect(...)`.
- Service boundary: `Context.Service(...)` plus `Layer.effect(...)`.
- Retry transient operation: `Effect.retry(...)` with a bounded `Schedule`.
- Time-sensitive test: `TestClock`, not real sleeping.
```

The Skillet spec keeps the main contract behavioral and moves API detail into references:

```markdown title="spec.md"
### Behavior: Keep External Boundaries Truthful

The agent SHALL decode untrusted responses, preserve typed transport, status,
and decode failures, and add retries or fallbacks only when the operation and
recovery policy justify them.

#### Scenario: Retry an Idempotent Provider Request

- **WHEN** an idempotent GET can return rate limits or malformed JSON
- **THEN** the agent retries only bounded transient failures and keeps exhausted
  failures visible
```

The eval uses a flawed provider fixture, a direct file-change gate, and one semantic judge instead of a pile of API-name searches:

```yaml title="evals/cases/keep-external-boundaries-truthful.yaml"
behavior: keep-external-boundaries-truthful
fixture: effect-app
prompt: |
  Harden src/provider.ts. Decode unknown responses, classify typed failures,
  and retry only bounded transient failures for this idempotent GET.
checks:
  - shell: '! git diff --quiet -- src/provider.ts'
  - judge: >
      The implementation separates transport, status, decode, and domain
      failures; validates unknown data; and keeps exhausted failures visible.
```

Explore both versions:

- [Generated Effect skill](https://github.com/getsentry/skillet/tree/main/examples/effect)
- [Pinned original snapshot](https://github.com/getsentry/skillet/tree/main/examples/effect/original)
- [Upstream provenance and license](https://github.com/getsentry/skillet/blob/main/examples/effect/UPSTREAM.md)

---

## Run the Examples

From a Skillet repository checkout:

```bash
skillet validate examples/commit-conventions
skillet validate examples/garfield
skillet validate examples/effect

skillet eval examples/commit-conventions --dry
skillet eval examples/garfield --dry
skillet eval examples/effect --dry
```

The dry runs confirm that every case requires agent work without starting model-backed trials.
