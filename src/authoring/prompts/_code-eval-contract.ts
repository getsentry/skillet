/**
 * The code-eval contract — the shared agreement between the
 * eval-gen generator and the verify-pass critic about what a
 * generated eval file MUST look like.
 *
 * Both prompts import this string verbatim:
 *
 * - The generator's system prompt opens with it so the model
 *   knows what it's producing and what'll be checked.
 * - The verifier's system prompt embeds it so the critic checks
 *   against exactly what the generator was told.
 *
 * Single source of truth: editing the caps here propagates to
 * both prompts without duplication.
 */
export const CODE_EVAL_CONTRACT = `## Code-eval contract

You produce **code-evals**. The deliverable is real \`expect(...)\`
assertions on deterministic shapes — regex with word boundaries,
specific substrings, tool-call sequences, output-object equality.
Prose belongs in the spec entry's rationale and the PR description,
not the test body. Judges exist for genuinely semantic checks; they
are the exception, not the default.

A separate critic call will verify every plan against this
contract. Plans that survive verify ship as-is; plans that violate
it cost an extra LLM call and a re-render.

### Caps

1. **At most one judge per file.** A behavior gets at most one
   named LLM judge, reused across cases that need semantic
   grading.
2. **Judge criteria ≤ 200 characters.** A short rubric — 1-2
   sentences. The renderer accepts up to 300 characters; the
   critic flags anything over 200.
3. **Judged cases need ≥2 deterministic checks.** Any case whose
   assertions include a \`judge\` MUST also include at least two
   deterministic assertions (\`output-matches\`,
   \`output-contains\`, \`output-not-contains\`,
   \`output-match-object\`, or \`tool-calls\`). A case whose only
   assertion is a judge is rejected.
4. **No bare-English-word patterns.** \`output-matches\` patterns
   and \`output-contains\`/\`output-not-contains\` values must
   not be a single common English word with no domain anchor.
   Banned bare values: \`vulnerable\`, \`unsafe\`, \`dangerous\`,
   \`risk\`, \`issue\`, \`problem\`, \`bug\`, \`wrong\`, \`bad\`,
   \`broken\`. A pattern combining a banned word with another
   anchor (e.g. \`\\\\bunsafe\\\\s+yaml\\\\.load\\\\b\`) is fine.
5. **Word-boundary regex for token checks.** When matching a
   load-bearing token (severity tag, finding label, API name),
   write \`\\\\b(HIGH|CRITICAL)\\\\b\` not \`HIGH\`. Bare uppercase
   tokens are rejected.
6. **No declared-but-unreferenced judges.** Every judge in
   \`plan.judges\` MUST be referenced by at least one case's
   \`judge\` assertion.

### Deterministic-first

Reach for a judge only when the rule is **semantic** — when the
quality of the agent's reasoning matters and no shape-based check
could verify it. Things that should be deterministic, not judged:

- The agent emitted a specific keyword (severity tag, sink name,
  CVE id, fixture filename) — use \`output-matches\` /
  \`output-contains\`.
- The agent invoked a specific tool sequence — use
  \`tool-calls\`.
- The agent produced a specific JSON shape — use
  \`output-match-object\`.
- The agent referenced a specific function name, file path, or
  YAML key from the input fixture — use \`output-contains\`.

Things a judge is appropriate for:

- The agent's *reasoning* connects two concepts (e.g. ties a
  privileged trigger to RCE).
- The agent correctly *justifies* a severity, distinguishes a
  true positive from a false positive, or explains an exploit
  mechanism.
- The check is irreducibly subjective (style, tone, completeness
  of an explanation).
`;
