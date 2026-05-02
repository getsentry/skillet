# Code-Evals: Request, Generate, Verify

## Why

Eval files are **code-evals**: the deliverable is real `expect(...)`
assertions and tightly-scoped tool-call shapes. Prose belongs in the
PR description and the spec entry's `rationale`, not in the test
body. The current eval-gen produces files that read like prose-
with-some-code — each LLM-judged behavior ships a 200–500-character
`criterion` rubric, and some cases lean on a judge where a specific
regex would prove the same point cheaper and more reliably. The
smoke regen of `wrdn-gha-workflows` (29 files, 17 judges) made the
gap visible: judges, not assertions, were the dominant surface.

The structural fix is a three-stage workflow that treats prose-vs-
code as a *contract* the generator must satisfy:

1. **Request** — the generator's system prompt opens with the
   contract: "you produce code-evals. Most of the assertion surface
   is `expect(...)` against deterministic shapes. Judges are the
   exception, not the default." The prompt tells the model up-front
   that a critic will check this.
2. **Generate** — the existing assertion-plan call, now operating
   under the explicit contract.
3. **Verify** — a second LLM call critiques the generator's plan
   against the same contract and returns specific edits if the plan
   still leans on prose, judges, or generic regex.

The user-facing framing matters: we **request code-evals** with a
clear contract, then **verify the contract was honored**. The
verify stage's job is exactly that check — it has the same
contract the generator was given, and it returns edits when the
contract was bent.

## What Changes

- **MODIFIED** Eval-gen prompt opens with the **code-eval
  contract** as the very first section: "You produce code-evals.
  The deliverable is `expect(...)` assertions; prose is the
  exception. A critic will verify this contract was honored."
  Hard caps stated inline as the contract terms: max 1 judge per
  file, max 200 chars per criterion, min 2 deterministic
  assertions per case for any case that uses a judge, no bare
  English-word regex.
- **NEW** Verify pass — a second LLM call whose sole job is to
  check the generator honored the code-eval contract. After the
  generator returns a valid plan, skillet issues
  `eval-gen:verify:<entry-id>` with the spec entry, the
  generated plan, and the same contract. The critic returns
  either `{ approve: true }` (contract honored) or
  `{ approve: false, edits: PlanEdit[] }` (specific contract
  violations to fix). Skillet applies the edits and renders.
- **NEW** `PlanEdit` discriminated union: `drop-judge`,
  `replace-judge-with-deterministic` (substitute a regex/contains
  list for a judge), `tighten-regex` (rewrite an assertion's
  pattern), `shorten-criterion` (rewrite a judge's criterion under
  the cap), `add-deterministic` (add a missing baseline check),
  `drop-assertion` (remove a redundant or overly generic check).
- **MODIFIED** Renderer hard caps. The renderer rejects:
  - any case whose only assertion is a `judge`
  - any judge whose `criterion` exceeds 300 characters
  - any `output-matches`/`output-contains` whose value is a single
    common English word (`vulnerable`, `unsafe`, `dangerous`,
    `risk`, `issue`, `problem`, `bug`) without combining
    qualifiers
  - more than one judge per file
  These bounce as `RenderError` so the generator (or the verifier's
  edit applier) can retry.
- **MODIFIED** `runEvalGen` flow: generate → verify → render. The
  generator's existing `MAX_ATTEMPTS_PER_ENTRY = 3` retry loop
  stays for parse/validate failures. The verifier runs once after a
  successful generate; if the verifier returns edits and applying
  them produces an invalid plan (or the renderer rejects the
  result), eval-gen falls back to the original plan with a warning
  rather than failing the whole entry.

## Non-Goals

- **Iterative critique loops.** Verify runs once. If the critic's
  edits don't pass the renderer, we ship the original plan plus a
  log warning. Running until convergence is not worth the cost.
- **Replacing judges entirely.** Judges remain the right tool for
  semantic checks (does the agent's reasoning actually connect the
  privileged trigger to RCE?). The change is *fewer judges, shorter
  criteria*, not zero judges.
- **Auto-rewriting existing eval files.** Only newly-generated
  files go through verify; durable hand-edited files stay
  untouched.
- **A separate `verify` command.** This is internal to the eval-gen
  phase, not a CLI surface.

## Capabilities Touched

- `skill-authoring` — verify pass added to the eval-gen phase, plan
  edit applier, prompt rewrites.
- `eval-format` — renderer hard caps tightened.
