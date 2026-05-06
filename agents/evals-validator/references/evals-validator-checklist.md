# Evals Validator Checklist

Walk these in order. For each failed check, draft one finding
with the listed kind+severity.

## 1. Coverage (severity: error)

For each `behaviors[]` and `must_not[]` entry in spec.yaml:

- `kind: missing-coverage` — No `evals/<id>.eval.ts` exists.

For each `evals/<id>.eval.ts` file in evals/:

- `kind: extra-coverage` — No spec entry has matching id
  (stale eval file from a removed behavior).

## 2. describeEval id (severity: error)

For each `evals/<id>.eval.ts`:

- `kind: drift` — `describeEval("…", …)` first arg doesn't
  match the file basename / spec entry id.

## 3. Case naming (severity: warning)

For each `it(...)` block:

- `kind: case-naming` — Case name doesn't follow
  `<entry-id>__<slug>` shape (entry id = enclosing
  describeEval id; `__` = double underscore).

## 4. Timeouts (severity: warning)

For each `it(...)` block:

- `kind: timeout-missing` — No `{ timeout: <ms> }` second
  argument. Vitest 4's default 5s causes false fails;
  every eval case must specify a timeout (90_000 prompt-only,
  120_000 fixture).

## 5. Banned assertions (severity: error)

For each `.eval.ts` file:

- `kind: banned-assertion` —
  `expect(result.session.outputText).toMatch(/.../)` or
  `.toContain(...)` or `.not.toContain(...)`. Substring/regex
  on free-form text is banned.
- `kind: banned-assertion` — Any other regex against
  `result.session.outputText` (e.g. via captures, splits, etc.).

Use grep:
```
grep -n "session.outputText" evals/*.eval.ts
```

## 6. Judge cap (severity: warning)

For each `.eval.ts` file:

- `kind: judge-cap` — File references more than 3 distinct
  judges. Suggest moving some assertions to structural
  (`output-match-object` or `tool-calls`) or splitting the
  case into multiple files.

## 7. Judge dedup (severity: warning)

For each judge name in `_judges.ts`:

- `kind: judge-dedup` — Name uses banned modifiers
  (`Correctly`, `Properly`, `Successfully`, `Accurately`,
  `Reasonably`).
- `kind: judge-dedup` — Name bakes in a specific case scenario
  (e.g. `IdentifiesPullRequestTargetTriggerJudge` instead of
  `IdentifiesPrivilegedTriggerJudge`).
- `kind: judge-dedup` — Two judges with names that look like
  variants of each other (`Identifies…Judge` vs.
  `IdentifiesCorrectly…Judge`) — collapse to one.

## 8. Judge orphans / missing (severity: warning for orphan, error for missing)

- `kind: judge-orphan` — `_judges.ts` declares a judge name
  no `.eval.ts` imports.
- `kind: judge-missing` — A `.eval.ts` imports a judge name
  not declared in `_judges.ts` (broken import).

## 9. Imports (severity: error)

For each `.eval.ts`:

- `kind: import` — File imports from anything outside the
  allowed set:
  - `vitest` (`expect`)
  - `node:url`, `node:path`
  - `@sentry/skillet/evals`
  - `./_judges.js`

Other imports indicate the eval reaches outside the harness
shape.

## 10. Fixture sanity (severity: warning)

For each `createWorkspace(skillRoot, "<slug>")` call in
`.eval.ts`:

- `kind: fixture-missing` — `evals/fixtures/<slug>/` does not
  exist.

For each `evals/fixtures/<slug>/` directory:

- `kind: fixture-orphan` — No `.eval.ts` references that slug
  in a `createWorkspace(...)` call.

## 10b. Judge threshold (severity: error)

For every `await expect(result).toSatisfyJudge(...)` call:

- `kind: missing-threshold` — The call passes only the judge
  with no `{ threshold: <number> }` second arg. vitest-evals
  defaults to `threshold: 1` for the explicit matcher (NOT
  the `judgeThreshold: 0.75` on `describeEval` — that's for
  automatic suite-level scoring, distinct from the explicit
  matcher). Without `{ threshold: 0.75 }`, an otherwise-correct
  response scoring 0.85 fails for an unintended reason.

The fix: `await expect(result).toSatisfyJudge(MyJudge, { threshold: 0.75 })`.

## 11. Workspace metadata (severity: error)

For each `it(...)` body in every `.eval.ts`:

- `kind: missing-cwd` — The `await run(...)` call does not pass
  `metadata: { cwd }`. Every tool call (`bash`, `read_file`,
  `list_files`, `grep`, `write_file`) requires `metadata.cwd`
  at runtime; missing it makes every tool throw and the test
  fails for an infrastructure reason unrelated to the rule.

The fix is: `const cwd = createWorkspace(skillRoot, "<slug>")`
(or `createWorkspace(skillRoot)` for an empty workspace), then
`run(input, { metadata: { cwd } })`. This applies to every
case, including pure-prose skills. Empty workspaces are fine.

## 12. Required vs. structural balance (severity: warning)

For each behavior whose `statement` clearly involves tool
usage (verbs like "read", "list", "execute", "audit"):

- `kind: structural-light` — Eval file relies entirely on
  judges with no `tool-calls` assertion. Suggest at least one
  `expect(toolCalls(result.session).map(c => c.name)).toContain("read_file")`-style
  check.

For each `output-match-object` / `toMatchObject` assertion:

- (no flag — these are good)

This check is judgment-based; err toward warning rather than
error. The eval-contract.md says structural-first is the
preference, not a hard requirement.

## 13. _judges.ts shape (severity: error)

For `_judges.ts`:

- `kind: drift` — File doesn't import `criterionJudge` from
  `@sentry/skillet/evals`.
- `kind: drift` — A declaration's first arg
  (the name string) doesn't match the const name:
  `export const FooJudge = criterionJudge("BarJudge", "...")`
  is broken.

## What NOT to flag

- Case prompts being phrased oddly (judgment).
- Fixture content being too long/short (judgment, unless
  fixture trips another must_not — that's a finding worth
  surfacing).
- Specific judge criterion text quality beyond the dedup
  rules.
- Anything about SKILL.md or references/. That's
  skill-validator's domain.

## Severity discipline reminder

`error` triggers an eval-writer re-pass. Reserve for
structural breakage. Use `warning` for convention nudges. Use
`info` for spec suggestions or polish.
