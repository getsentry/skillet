# Diagnostic Schema

Same JSON shape as skill-validator. Mismatches make the
orchestrator surface a parse error and stop — be precise.

## Top-level shape

```json
{
  "ok": <boolean>,
  "findings": [<finding>, …]
}
```

## Finding shape

```json
{
  "severity": "error" | "warning" | "info",
  "subject": "<string>",
  "kind": "<string>",
  "message": "<string>",
  "suggestion": "<string>"   // optional
}
```

## Subject conventions for evals

- `behavior:<id>` — a spec behavior with eval coverage issues.
- `must_not:<id>` — a spec must_not with eval coverage issues.
- `eval:<id>` — a specific eval file (the `<id>` matches the
  spec entry id and the file basename).
- `judge:<Name>` — a specific judge in `_judges.ts`.
- `fixture:<case-slug>` — a specific fixture directory.
- `evals` — the suite as a whole.

## Kind conventions for evals

- `missing-coverage` — spec entry has no eval file.
- `extra-coverage` — eval file has no corresponding spec
  entry (stale).
- `banned-assertion` — `expect(outputText).toMatch(...)` /
  `.toContain(...)` against `result.session.outputText`.
- `judge-cap` — a `.eval.ts` references > 3 judges.
- `judge-dedup` — judge name violates the naming-stem
  conventions or has unnecessary modifiers (`Correctly`,
  `Properly`).
- `judge-orphan` — `_judges.ts` declares a judge no `.eval.ts`
  references.
- `judge-missing` — `.eval.ts` imports a judge `_judges.ts`
  doesn't declare.
- `case-naming` — case name doesn't follow
  `<entry-id>__<slug>` shape.
- `timeout-missing` — `it(...)` block without an explicit
  timeout (vitest default 5s causes false fails).
- `import` — `.eval.ts` imports something outside the allowed
  set.
- `fixture-orphan` — `evals/fixtures/<slug>/` exists but no
  `.eval.ts` references it.
- `fixture-missing` — `.eval.ts` calls
  `createWorkspace(skillRoot, "<slug>")` but
  `evals/fixtures/<slug>/` doesn't exist.

Open-ended — invent new kinds when needed.

## Output position

The orchestrator parses the LAST fenced JSON block in your
terminal text. Use ` ```json ` as the fence open marker (or
just ` ``` `). End with ` ``` ` on its own line.
