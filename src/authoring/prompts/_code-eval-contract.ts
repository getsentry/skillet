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

**Structural assertions are first-class. LLM-rubric judges are a
last resort.** Default to code-shaped checks; only reach for a
judge when nothing structural fits.

Three first-class assertion shapes, in order of preference:

1. **\`output-match-object\` — STRUCTURAL.**
   When the skill emits a structured finding block (JSON, YAML,
   or any parseable shape on \`result.output\`), pin properties
   with \`expect(result.output).toMatchObject({ ... })\`. This is
   the cleanest assertion when output is structurable.

2. **\`tool-calls\` — STRUCTURAL.**
   Two flavors:

   - **Names** (\`names-equal\` / \`names-include\` / \`names-exclude\`):
     pin which tools were called.
   - **Args** (\`any-call\` / \`no-call\`): pin a specific tool
     call with matching arguments. **This is high-leverage and
     underused.** "The agent must read \`.github/workflows/ci.yml\`
     before flagging" → \`{ type: "any-call", name: "read_file",
     argsMatch: { path: ".github/workflows/ci.yml" } }\`. Use
     this to assert the agent traced the chain (read the file,
     grepped the trigger, etc.) — that proves work that no
     judge needs to LLM-call to verify.

3. **\`judge\` — LAST RESORT.**
   Only when the deliverable is free-form text reasoning that
   can't be checked structurally. Declare narrow named judges
   with \`criterionJudge("Name", "…rubric…")\` and assert with
   \`await expect(result).toSatisfyJudge(NameJudge)\`. Each judge
   tests **one property**. **Aim for ≤2 judges per case** — every
   judge is an LLM call at test time; structural checks are
   free.

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

1. **Per-file cap: ≤3 judges.** More than that almost always
   means you're using judges where structural would work. Look
   at every judge and ask: "could this be a tool-args check or
   an output-match-object check instead?"
2. **Aim for ≤2 judges per case.** Every additional judge is an
   LLM call at test time. Structural checks are free.
3. **Judge criteria ≤ 200 characters.** Tight, one-property
   rubric — 1-2 sentences. Renderer accepts up to 300 chars.
4. **Every declared judge is referenced.** No dead judge
   declarations.
5. **Every case with tool-using behavior SHOULD have at least
   one structural \`tool-calls\` assertion.** If the agent is
   expected to read a file, call a specific helper, or avoid a
   dangerous tool — pin that with \`any-call\`/\`no-call\`/
   \`names-include\`/\`names-exclude\` BEFORE adding judges. This
   is the single biggest lever on quality.

### How to pick

- **Skill emits structured output?** → \`output-match-object\` for
  every property you can pin (severity, trigger, file path,
  status). Then a judge for the prose reasoning if any.
- **Skill must trace a path through tools (read file → identify
  pattern → flag)?** → \`tool-calls\` \`any-call\` to assert the
  trace. Cheap, deterministic, proves real work.
- **Free-form prose reasoning is THE deliverable, with no
  structural surface?** → narrow judge per property.

The order above is the priority. Judges are the fallback, not
the default.

### Reuse judges across behaviors

Judges are **suite-wide artifacts**. The consolidation pass dedupes
by **exact name match** and writes one canonical declaration per
unique name to \`evals/_judges.ts\`. If your judge tests a property
that another behavior also tests — *reuse the name verbatim* so
the two declarations collapse into one. The whole point is that
many security-review behaviors share check-shapes
("did the agent identify the trigger?", "did it rate severity?",
"did it connect the exploit chain?"); these should be ONE
canonical judge each, referenced from every behavior that needs
them, not redeclared per behavior.

**Default to reuse.** When you sit down to declare a judge, ask
first: "is there a reasonable canonical name some other behavior
in this skill would also use?" If yes, use that name. New names
should appear only when the property is genuinely specific to
this one behavior.

#### Canonical naming stems

Pick the smallest stem that fits. Don't be cute. **Do not** add
modifiers like \`Correctly\`, \`Properly\`, \`Successfully\`,
\`Accurately\`, \`Reasonably\` — they don't change the meaning,
they just defeat dedup. Two behaviors that both need the
"identifies the trigger" check should both name their judge
\`IdentifiesPrivilegedTriggerJudge\` (NOT
\`IdentifiesPrivilegedTriggerJudge\` and
\`IdentifiesTriggerCorrectlyJudge\`).

Recommended stems:

- \`Identifies…Judge\` — agent named the artifact / trigger /
  sink / role / construct
- \`Rates…Judge\` — agent assigned a severity / confidence /
  rating
- \`Connects…Judge\` — agent tied two concepts together
  (trigger → impact, input → sink, etc.)
- \`Distinguishes…Judge\` — agent correctly differentiated
  between two adjacent concepts
- \`Recommends…Judge\` — agent emitted a remediation / fix /
  hardening
- \`Explains…Judge\` — agent justified a verdict with reasoning
- \`Includes…Judge\` — agent included a required output element
  (file/line, fix code, etc.)
- \`DoesNotFlag…Judge\` — must_not: agent did NOT flag a
  non-issue
- \`DoesNotFabricate…Judge\` — must_not: agent did NOT invent
  a missing piece of evidence
- \`DoesNotRecommend…Judge\` — must_not: agent did NOT
  recommend something forbidden

#### Examples

**Good (reuses across behaviors)**:
\`\`\`
IdentifiesPrivilegedTriggerJudge   // used by report-pwn-request, report-credential-exposure, state-entry-point
RatesHighSeverityJudge             // used by anything that tests severity calibration on a HIGH case
ConnectsExploitChainJudge          // used by report-pwn-request, report-toctou, report-comment-chatops
\`\`\`

**Bad (over-specific, defeats dedup)**:
\`\`\`
IdentifiesPullRequestTargetTriggerJudge       // too specific — use IdentifiesPrivilegedTriggerJudge
RatesHighSeverityCorrectlyJudge               // "Correctly" adds nothing — drop it
ConnectsExploitChainForPwnRequestJudge        // bake the case in the criterion text, not the name
\`\`\`

The verifier will rename judges that violate these patterns —
ship clean names from the start to avoid the round trip.

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
generated test calls
\`const cwd = createWorkspace(skillRoot, "<case-name>")\` (skillet's
helper that copies the tree into a tempdir and registers cleanup
with vitest's \`onTestFinished\`) followed by
\`await run(input, { metadata: { cwd } })\`. The fixture lives
as real files on disk — readable, editable normally.

There is no \`setup\` shell-script field. If you need shell-side
preparation, prefer writing the resulting files into the
\`fixture\` map directly.
`;
