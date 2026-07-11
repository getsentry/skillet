import { specTemplate } from "../spec/template.js";

export type ArtifactId = "spec" | "skill" | "evals";

export interface Instructions {
  artifact: ArtifactId;
  outputPath: string;
  template: string;
  instructions: string;
}

const SPEC_INSTRUCTIONS = `Write spec.md — the source of truth for this skill's intent. SKILL.md and eval cases are derived from it; humans review intent by reading its diffs.

Grammar (validated by 'skillet validate'):
- "# <Skill Name>" title, then "## Intent", "## Triggers", "## Behaviors", optional "## Constraints".
- Behaviors are "### Behavior: <name>" (exactly three hashes) with normative SHALL/MUST prose.
- Every behavior needs at least one "#### Scenario: <name>" (exactly four hashes) with "- **WHEN** ..." and "- **THEN** ..." bullets. GIVEN/AND bullets are also accepted.
- Constraints are "### Constraint: <name>" stating what the agent MUST NOT do.
- Behavior names slugify to ids (e.g. "Commit message format" -> commit-message-format); eval cases reference those ids, so keep names stable once evals exist.

Writing rules:
- Intent: one or two paragraphs — what the skill makes the agent do and why it exists. No implementation detail.
- One behavior = one observable, independently testable rule. If you cannot phrase a WHEN/THEN scenario for it, it is not a behavior — move it to Intent or drop it.
- Scenarios are concrete: name real files, commands, phrasings — they become eval cases nearly verbatim.
- Triggers need both directions: SHOULD bullets for when the skill applies, SHOULD NOT bullets for the nearest situations where it must stay quiet. The SHOULD NOT side is what prevents over-triggering, the most common skill defect.
- Constraints capture damage the skill must never cause (leaking secrets, force-pushing, editing unrelated files). Each MUST NOT should name a temptation the skill text could plausibly create.
- Keep it small: more than ~8 behaviors usually means two skills. Split rather than pile on.
- If the user's request is ambiguous about scope, audience, or edge cases, ask 2-4 pointed questions BEFORE writing — the spec is the contract, so ambiguity resolved now is eval flakiness avoided later.

After writing: run 'skillet validate' and fix every error; warnings are judgment calls.`;

const SKILL_INSTRUCTIONS = `Render SKILL.md from spec.md. The spec states intent; SKILL.md is the instruction text an agent actually loads. Rewrite, don't copy — spec grammar (SHALL, scenarios) is for validation, not for the agent reading the skill.

Frontmatter (required):
- name: the skill slug.
- description: third person, one sentence of what it does plus the concrete trigger conditions ("Use when...") — this is the ONLY text the agent sees before deciding to load the skill, so pack the spec's SHOULD triggers into it and honor the SHOULD NOT side by not overclaiming.
- spec_hash: copy the value from 'skillet status --json' (.spec.hash). It ties this render to the spec content so 'skillet status' can detect staleness reliably.

Body rules:
- Imperative voice, written to the agent ("Run...", "Never...", not "The agent shall...").
- Express every behavior from the spec; keep the spec's constraints as explicit never-do lines. If a behavior cannot be expressed without contradicting another, stop and fix the spec instead.
- Structure for execution: lead with the workflow or decision points, not background. Concrete examples beat abstract rules — one good worked example per tricky behavior.
- Keep SKILL.md under ~150 lines. Detail that only matters mid-task (long tables, API references, edge-case catalogs) goes in references/<topic>.md files, linked with a one-line pointer that says when to open them.
- No meta-content: nothing about specs, evals, skillet, or how the skill was authored.

After writing: 'skillet validate' checks frontmatter; 'skillet eval' is the real test.`;

const EVALS_INSTRUCTIONS = `Write eval cases under evals/cases/ — one YAML file per case, at least one case per behavior in spec.md (uncovered behaviors are validation warnings). Name the file after the behavior it tests (e.g. commit-message-format.yaml).

Case schema:
  behavior: <behavior id from spec.md>   # required
  prompt: |                              # required — the user message
  fixture: <slug>                        # optional — evals/fixtures/<slug>/ copied into the workspace
  setup: |                               # optional — shell run in the workspace before the agent
  checks:                                # what proves the behavior happened
    - file_exists: <path>
    - shell: <command>                   # exit 0 = pass, runs in the workspace
    - judge: <criterion>                 # LLM-graded through the harness
  trials: 1                              # optional
  timeout: 300                           # optional, seconds

Rules that keep evals honest:
- Derive each case from a spec scenario: the WHEN becomes fixture/setup + prompt, the THEN becomes checks.
- Prompts are realistic user asks. Never quote the skill's own wording or name the expected artifact — a prompt that says "create marker.txt" tests reading comprehension, not the skill.
- Prefer deterministic checks (file_exists, shell) — grep committed files, inspect git state, run the produced code. Use at most ONE judge check per case, only for genuinely semantic questions ("the explanation names the root cause"), and phrase the criterion as an objectively checkable statement.
- The workspace after the run is the whole observable record for deterministic checks; transcripts are only visible to judges. Check artifacts, not phrasing.
- Skill installation itself adds files to the workspace (.claude/ for claude, AGENTS.md for codex). Never assert repo-wide cleanliness; assert that the specific files you care about are unchanged (e.g. git status --porcelain -- . ':(exclude).claude' ':(exclude)AGENTS.md').
- Fixtures are committed starting states (a repo, a codebase excerpt); setup is for cheap dynamic state (git init, timestamps). Fixture directories must exist — validation fails on dangling slugs.
- A case that passes without the skill installed proves nothing: design cases where the unskilled agent plausibly does something else, then confirm with 'skillet eval --baseline' that lift is positive.
- Set trials > 1 only for behaviors you have seen flake; otherwise keep runs cheap.

After writing: 'skillet validate' (schema + coverage), then 'skillet eval' to run.`;

/** Minimal YAML case skeleton; the full schema lives in EVALS_INSTRUCTIONS. */
const EVALS_TEMPLATE = `behavior: <behavior-id>
prompt: |
  <realistic user ask>
checks:
  - file_exists: <path>
  - shell: <command that exits 0 on success>
`;

const PAYLOADS: Record<ArtifactId, Instructions> = {
  spec: {
    artifact: "spec",
    outputPath: "spec.md",
    template: specTemplate("<Skill Name>"),
    instructions: SPEC_INSTRUCTIONS,
  },
  skill: {
    artifact: "skill",
    outputPath: "SKILL.md",
    template: `---\nname: <slug>\ndescription: <what it does + when to use it>\nspec_hash: <from skillet status --json .spec.hash>\n---\n\n# <Skill Name>\n\n<instructions to the agent>\n`,
    instructions: SKILL_INSTRUCTIONS,
  },
  evals: {
    artifact: "evals",
    outputPath: "evals/cases/<behavior-id>.yaml",
    template: EVALS_TEMPLATE,
    instructions: EVALS_INSTRUCTIONS,
  },
};

/** The template + writing rules payload for one artifact. */
export const instructionsFor = (artifact: ArtifactId): Instructions => PAYLOADS[artifact];
