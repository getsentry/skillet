# Skill Validator Checklist

Walk these in order. For each failed check, draft one finding
with the listed kind+severity. Don't combine multiple failures
into one finding.

## 1. Frontmatter (severity: error)

- `kind: frontmatter` — SKILL.md does not start with `---` /
  YAML / `---` delimiters.
- `kind: frontmatter` — Missing `name:` or `description:`.
- `kind: frontmatter` — `name:` does not match `spec.name`.

## 2. Behavior coverage (severity: error)

For each `behaviors[]` entry in spec.yaml:

- `kind: missing-coverage` — No H2 section in SKILL.md whose
  topic clearly corresponds to the behavior. Match by
  semantic correspondence, not by exact-string match — an H2
  "## Identify N+1 query patterns" satisfies behavior
  `flag-n-plus-one` even if the heading isn't verbatim.

For each H2 in SKILL.md (excluding "Don't" and
"Reference Loading"):

- `kind: extra-coverage` — Section corresponds to no spec
  behavior. Either the spec is missing a behavior (suggestion:
  surface to user) or SKILL.md added unauthorized content.

## 3. Must_not coverage (severity: error)

For each `must_not[]` entry in spec.yaml:

- `kind: missing-coverage` — No bullet under a "Don't" (or
  similarly named negative-rules) H2 corresponds to the
  must_not.

For each bullet under "Don't":

- `kind: extra-coverage` — Bullet doesn't correspond to any
  spec must_not.

## 4. Triggers (severity: error)

For each phrase in `spec.triggers.should`:

- `kind: triggers` — Phrase does not appear (verbatim or
  near-verbatim) in the description.

For the description as a whole:

- `kind: triggers` — Description says nothing about when to
  use the skill.

## 5. References (severity: error)

For each `references[]` entry in spec.yaml:

- `kind: reference-routing` — `references/<path>` file does
  not exist on disk.
- `kind: reference-routing` — SKILL.md does not mention the
  reference path verbatim in a routing table or "open when…"
  block.

For each `references/*.md` file on disk:

- `kind: reference-routing` — File exists but no
  `spec.references[]` entry references it (orphan reference).

## 6. Voice (severity: warning)

For the SKILL.md body (everything after frontmatter):

- `kind: voice` — A behavior section uses passive voice:
  "Rows should be fetched", "The diff is read", "Tests are
  run before commit". Imperative would be "Fetch rows", "Read
  the diff", "Run tests before committing".
- `kind: voice` — A behavior section uses third-person:
  "The skill reads…", "This skill identifies…". Body is
  always imperative, addressing the agent directly.

The frontmatter `description` is the only third-person place;
flagging it for being third-person is wrong.

## 7. Independence (severity: error)

- `kind: independence` — SKILL.md says "use the X skill",
  "run sentry-skills:Y", "load skills/other-skill/...". A
  skill must stand alone.

Mentioning other skill names in non-runtime content (audit
logs, eval prompts meant for humans) is fine. Flag only when
the body instructs the agent at runtime to invoke another
skill.

## 8. Length (severity: warning)

- `kind: length` — SKILL.md exceeds 500 lines.
  Suggestion: identify which behavior section is largest;
  recommend extracting it to `references/`.

## 9. Padding (severity: warning)

- `kind: padding` — SKILL.md has an "About this skill" /
  "Examples" / "Overview" / "Introduction" section without
  spec backing. Sections must correspond to spec entries or
  to references-loading.

## 10. Reference content (severity: warning)

For each `references/*.md` file:

- `kind: drift` — Content doesn't address the
  `spec.references[i].topics[]` listed for that file.
- `kind: padding` — File contains prose unrelated to its
  topics.

## What NOT to flag

- Prose style preferences ("this could be tighter") — not your
  call.
- Missing rationale on a behavior — that's a spec issue, not a
  rendering issue.
- The exact heading text for a behavior section — only the
  semantic correspondence matters.
- Anything about the eval files. That's evals-validator's
  domain.

## Severity discipline reminder

`error` triggers a writer re-pass. Reserve for structural
breakage vs. spec. Use `warning` liberally for style/quality
nudges. Use `info` for spec-level suggestions the user might
want.
