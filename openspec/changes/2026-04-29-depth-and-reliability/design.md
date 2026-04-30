# Design

## Semantic Verify

Semantic verification should judge small batches of spec entries independently.
Each batch receives the full SKILL.md and a bounded list of rules, then returns
verdicts for that batch only. If one batch produces malformed JSON, only that
batch is marked missing.

The parser should tolerate common LLM formatting by extracting the first JSON
array when the full response is not parseable.

## Eval Generation

Eval generation already runs per behavior. After parsing a generated case, run
its optional `setup` script in the same temp workspace helper the harness uses.
Invalid setup becomes a retryable validation failure with the shell error in the
repair prompt.

The eval-gen prompt should explicitly require creating parent directories before
writing nested files.

## Tool Calls

The agent loop should record tool-call metadata on assistant messages in the
normalized transcript. Judges and test callbacks already consume
`session.messages[].toolCalls`; this change makes that field real rather than
empty.

CriterionJudge should grade the normalized transcript, not only final assistant
text. Tool-use criteria like "the agent read a reference file" are otherwise
unobservable even when the harness captured tool calls correctly.

## Skill References in Evals

Eval agents run in an isolated workspace, while skill reference files live under
the skill root. The harness should make `references/*.md` readable skill
resources via `read_file`, `list_files`, and `grep`, and the system prompt
should list the available reference paths so agents know they are shipped.

## Timeouts

Vitest test timeout should include the case's agent timeout plus judge/artifact
overhead. Generated eval files should default to a larger suite timeout so
multi-step investigation cases are not killed before the judge runs.

## Staging

Staging must isolate live files until commit. Seed staged skill directories by
copying files, not hard-linking them; otherwise writes to regenerated files can
truncate the live inode before the staged commit succeeds.

## Authoring Depth

Use skill-writer's class/dimension guidance directly in Skillet's bundled
authoring guidance. For security-review and domain-expert skills, the spec
initializer should not stop at the minimal core. It should include:

- vulnerability/pattern coverage,
- investigation workflow,
- false-positive traps,
- severity/output calibration,
- framework/product-specific routing when the description names a broad stack,
- must-not boundaries for neighboring review classes.

Reference-heavy guidance should live in generated `references/*.md` files. The
spec can declare reference metadata (`path`, `title`, `load_when`, `purpose`,
and `topics`). SKILL.md then contains concise loading instructions, while the
reference file carries larger checklists, examples, edge cases, and
false-positive guidance. Reference files are generated only when missing and are
then treated as durable user-editable artifacts, matching eval-file behavior.

When the spec initializer cannot make a high-impact planning decision safely, it
may interrupt with a single human-facing question. This is not for cosmetic
wording; it is for decisions that materially affect behavior/eval coverage, such
as target framework families, trusted sources, or whether neighboring domains
are intentionally in scope.
