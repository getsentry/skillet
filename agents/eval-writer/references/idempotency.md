# Idempotency

Existing eval files are durable. Read them, but **do not
overwrite** unless the corresponding spec entry has changed
materially.

## When to write a NEW eval file

- The spec entry (`behaviors[].id` or `must_not[].id`) does
  not have a corresponding `evals/<id>.eval.ts` on disk.

## When to OVERWRITE an existing eval file

- The spec entry's `statement` has changed materially since
  the file was last written. (A typo fix in the statement is
  not material; a meaning change is.)
- The spec entry's `rationale` has changed in a way that
  invalidates the existing assertion shape.
- A validator finding from this run (in your Additional
  Context) explicitly demands changes to the file.

## When to LEAVE an existing eval file alone

- Default. If neither of the above triggers fired, leave the
  file as-is. Hand edits stick. Changes the user made between
  runs are intentional.
- Even if you would have written the file differently from
  scratch — that's an aesthetic preference, not a reason to
  churn.

## How to detect "spec entry changed materially"

You don't have a spec history. Heuristics:

1. **Compare the existing file's first `it(...)` prompt** to
   the spec entry's `statement`. If the prompt no longer makes
   sense given the current statement (different domain,
   different action verb), the spec changed materially.
2. **Compare existing assertions** to what the current rule
   would test. If the existing file pins
   `severity: "MEDIUM"` but the spec now says
   "Flag pwn-requests as HIGH or CRITICAL", the spec moved.
3. **Read the validator's findings.** If evals-validator's
   diagnostic lists `evals/<id>.eval.ts` with kind `drift`
   and severity `error`, treat the file as needing rewrite.

When in doubt, **leave the file alone** and surface the
ambiguity in your terminal output ("evals/<id>.eval.ts may be
stale vs. current spec; consider regenerating after spec
review").

## `_judges.ts` is different

`evals/_judges.ts` is rewritten as a whole on every pass. It's
the canonical inventory of judges referenced across the suite,
deduped by exact name match. Each pass:

1. Read existing `_judges.ts` if present — its declarations
   are starting state.
2. Add new judges introduced in this pass.
3. Drop judges no longer referenced by any `.eval.ts` file
   (after this pass's writes).
4. Sort by name. Write the full file.

Judges are stable artifacts — adding a new one shouldn't
break old declarations. Removing one is fine if nothing
references it anymore.

## Fixture files

Fixture files under `evals/fixtures/<case-slug>/` follow the
same idempotency: don't overwrite unchanged content. If the
case is new (file you're about to write), seed the fixture. If
the case is unchanged, leave the fixture alone.

## What the validator catches

- Eval file referencing a spec entry that no longer exists →
  stale (validator suggests deletion).
- Spec entry with no eval file → coverage gap (validator
  suggests writing one).
- Eval file whose case names mismatch its spec entry id →
  drift.
- `_judges.ts` declaring judges no `.eval.ts` references →
  orphan judges.
- `_judges.ts` missing a judge that some `.eval.ts` imports →
  broken import.

If you hit any of these in a re-pass, the validator's findings
in your Additional Context will name the exact file.
