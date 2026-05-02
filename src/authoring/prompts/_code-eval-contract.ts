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

Eval files are **code-evals**. Assertions test the agent through
one of three first-class shapes:

1. **Structural — \`output-match-object\`.**
   When the skill emits a structured finding block (JSON, YAML,
   or any parseable shape on \`result.output\`), pin properties
   with \`expect(result.output).toMatchObject({ ... })\`. This
   is how upstream vitest-evals demos work and the cleanest
   assertion when output is structurable.

2. **Structural — \`tool-calls\`.**
   When the rule constrains tool sequences or arguments, pin the
   tool calls with \`expect(toolCalls(result.session).map(c => c.name)).toEqual([...])\`
   (or \`arrayContaining\` / \`not.toContain\`).

3. **Named LLM-rubric judges.**
   When the deliverable is free-form text reasoning (an
   explanation, a code review, a refusal), declare narrow named
   judges with \`judge("Name", async ({ criterion }) => criterion("…"))\`
   and assert with \`await expect(result).toSatisfyJudge(NameJudge)\`.
   Each judge tests **one property**. Multiple judges per case
   is the normal shape — split assertions across several
   single-property judges, not one paragraph-long rubric.

### Banned

**Regex or substring matching against \`result.session.outputText\`
is banned.** That includes:

- \`expect(result.session.outputText).toMatch(/.../)\`
- \`expect(result.session.outputText).toContain("...")\`
- \`expect(result.session.outputText).not.toContain("...")\`

The agent's chat output paraphrases between runs. Regex on
free-form text is a brittle proxy that fails or passes for the
wrong reasons. If the property is structurable, use the skill's
structured output. If it isn't, write a narrow named judge.

The plan's assertion kinds are limited to \`output-match-object\`,
\`tool-calls\`, and \`judge\`. There are no \`output-matches\` /
\`output-contains\` / \`output-not-contains\` kinds.

### Caps

1. **Multiple narrow judges encouraged.** Each judge tests ONE
   property. Per-file cap: ≤5 judges (more than that means
   you're not splitting properties cleanly).
2. **Judge criteria ≤ 200 characters.** Tight, one-property
   rubric — 1-2 sentences. Renderer accepts up to 300 chars.
3. **Every declared judge is referenced.** No dead judge
   declarations.
4. **A case can be 100% judges.** No deterministic floor —
   stacking 2-3 narrow \`toSatisfyJudge\` calls in one case is
   the canonical shape for free-form rules.

### Judge-first vs structural-first

Reach for **structural** (\`output-match-object\`, \`tool-calls\`)
when the skill emits a structured finding block — JSON, YAML,
key:value pairs the eval can parse. Each property pinned by a
structural assertion is a property you don't have to spend a
judge LLM call on.

Reach for **named LLM-rubric judges** when the deliverable is
free-form text reasoning. Split the rule into single-property
judges — one for "did the agent identify the trigger?", another
for "did it connect the exploit chain?", another for "did it
rate severity correctly?". Each judge fails independently with
a useful rationale.

### Stable judge naming

Judges declared across the suite are deduped at consolidation
time by **exact name match**. To make dedup catch the same
concept across behaviors, follow stable verb-prefix patterns:

- \`Identifies…Judge\` — agent named the artifact / trigger / sink
- \`Rates…Judge\` — agent assigned a severity / confidence
- \`Connects…Judge\` — agent tied two concepts together
- \`Recommends…Judge\` — agent emitted a remediation
- \`RecognizesNo…Judge\` — must_not: agent correctly did NOT
  flag a non-issue
- \`DoesNot…Judge\` — must_not: agent did NOT do something
  forbidden

Two behaviors that need the same property check should reuse the
same judge name verbatim — they collapse into one declaration in
\`evals/_judges.ts\`. Distinct semantics get distinct names. You
do not need to dedupe yourself; the consolidation pass handles
it.

### Fixtures (workspace seeding)

When a case needs a workspace fixture (a YAML file to audit, a
script to read, a directory tree), use the case's \`fixture\`
field — a map from relative workspace path to file content:

\`\`\`json
"fixture": {
  ".github/workflows/ci.yml": "name: CI\\non: pull_request_target\\n...",
  "scripts/run.sh": "#!/bin/bash\\nset -e\\n..."
}
\`\`\`

Skillet writes those files under
\`evals/fixtures/<case-name>/\` at consolidation time, and the
generated test calls \`await harness.useFixture(<case-name>)\` to
copy the tree into the per-test workspace. The fixture lives as
real files on disk — readable, editable normally.

Do NOT use the legacy \`setup\` field (a single shell script)
unless you genuinely need shell logic beyond writing files. The
\`fixture\` map covers the overwhelming common case.
`;
