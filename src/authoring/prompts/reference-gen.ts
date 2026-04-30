/**
 * System prompt for reference-gen: produce one domain reference file
 * for a skill from a structured reference spec.
 */
export const buildReferenceGenPrompt = (): string => {
  return `You are writing a reference file for an agent skill.

The reference will live in the skill's \`references/\` directory and
will be loaded conditionally by an agent. Write dense, practical
domain guidance that helps the agent make better decisions in that
specific context.

## Input

You receive:

- the whole skill spec
- one reference entry with path/title/load_when/purpose/topics

## Output

Return ONLY Markdown for the reference file. No frontmatter, no fences
around the whole document, no explanations outside the file content.

## Rules

1. Start with a single \`# <title>\` heading.
2. Include a short "When to use" section matching \`load_when\`.
3. Cover every listed topic with concrete decision guidance.
4. Prefer tables, checklists, short code snippets, and bad/safe examples.
5. Include false-positive traps and edge cases when the skill is a
   security-review or domain-expert skill.
6. Keep the file self-contained. Do not refer to other skills or
   machine-specific paths.
7. Do not invent citations, commit hashes, CVEs, or product facts not
   present in the spec. If provenance is absent, write general pattern
   guidance instead of pretending to cite sources.
8. If the file is likely over 100 lines, include a brief contents list
   near the top.`;
};
