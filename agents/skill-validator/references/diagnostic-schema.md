# Diagnostic Schema

The JSON shape the orchestrator expects in your final fenced
block. Mismatches make the orchestrator surface a parse error
and stop — be precise.

## Top-level shape

```json
{
  "ok": <boolean>,
  "findings": [<finding>, …]
}
```

- `ok` — `true` only when zero findings exist. If you emit any
  finding (even info-level), set `ok: false`.
- `findings` — array. Empty when `ok: true`.

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

- `severity` — see SKILL.md severity discipline. Errors trigger
  a re-pass; warnings/info do not.
- `subject` — what the finding is about. Conventional shapes:
  - `behavior:<id>` — a specific behavior in spec.yaml.
  - `must_not:<id>` — a specific must_not in spec.yaml.
  - `skill` — the SKILL.md as a whole.
  - `reference:<path>` — a specific references/ file.
  - `description` — the frontmatter description.
  - `triggers` — the trigger phrases as a set.
- `kind` — coarse classification, used for routing/aggregation.
  Common kinds for skill-validator:
  - `missing-coverage` — spec entry has no rendering.
  - `extra-coverage` — SKILL.md has content with no spec backing.
  - `drift` — rendered content disagrees with spec.
  - `voice` — passive/descriptive where imperative is required.
  - `triggers` — trigger phrase missing or paraphrased.
  - `independence` — runtime references to another skill by name.
  - `length` — over the 500-line budget.
  - `padding` — prose without spec backing.
  - `reference-routing` — references/ file present but not
    routed in SKILL.md, or vice versa.
  - `frontmatter` — frontmatter missing/invalid.

  Open-ended — invent new kinds when needed. Keep them
  hyphen-cased and short.
- `message` — one-line summary. Specific. Names the offending
  element by exact spec id or path.
- `suggestion` — concrete fix. Optional but strongly preferred
  for `error` severity (the writer agent uses it on re-pass).

## Bad findings (avoid)

```json
{
  "severity": "error",
  "subject": "skill",
  "kind": "quality",
  "message": "The skill could be improved."
}
```

Vague subject, vague kind, vague message. Says nothing
actionable.

```json
{
  "severity": "error",
  "subject": "behavior:flag-n-plus-one",
  "kind": "missing-coverage",
  "message": "Section 4 of SKILL.md is wrong."
}
```

Subject names a behavior id, but the message references
"Section 4" without explaining what's wrong. Describe the
mismatch, don't just point.

## Good findings

```json
{
  "severity": "error",
  "subject": "behavior:flag-n-plus-one",
  "kind": "missing-coverage",
  "message": "Spec behavior 'flag-n-plus-one' has no section in SKILL.md.",
  "suggestion": "Add an H2 section rendering the rule from spec.behaviors[0].statement, with rationale."
}
```

Specific subject, specific kind, message names the exact
mismatch, suggestion tells the writer what to do.

## Output position

The orchestrator parses the LAST fenced JSON block in your
terminal text. You may emit prose, log lines, or even multiple
JSON examples — but the LAST fenced block must be the final
diagnostic. Anything else fails the parse and the orchestrator
treats your run as malformed.

Use ` ```json` as the fence open marker (or just ` ``` ` —
both work). End with ` ``` ` on its own line.
