# Eval Contract

The agreement between you (eval-writer) and skillet's
evals-validator about what a `.eval.ts` file must look like.
Validator pushback maps directly to lines in this file.

## Structural assertions are first-class. LLM-rubric judges are a last resort.

Default to code-shaped checks. Reach for a judge only when
nothing structural fits.

Three first-class assertion shapes, in order of preference:

### 1. `expect(result.output).toMatchObject(...)` — STRUCTURAL.

When the skill emits a structured finding block (JSON, YAML, or
any parseable shape that lands on `result.output`), pin
properties:

```ts
expect(result.output).toMatchObject({
  severity: "HIGH",
  trigger: "pull_request_target",
});
```

Cleanest assertion when output is structurable.

### 2. Tool-call assertions — STRUCTURAL.

Two flavors. Both pull from `toolCalls(result.session)`:

**Names** (which tools were called):
```ts
const names = toolCalls(result.session).map((c) => c.name);
expect(names).toContain("read_file");
expect(names).not.toContain("bash");
```

**Args** (a specific tool call with matching arguments):
```ts
const calls = toolCalls(result.session);
expect(calls).toContainEqual(
  expect.objectContaining({
    name: "read_file",
    arguments: expect.objectContaining({
      path: ".github/workflows/ci.yml",
    }),
  }),
);
```

Args matchers are **high-leverage and underused**. "The agent
must read `.github/workflows/ci.yml` before flagging" → assert
the tool call. That proves real work — no judge needed.

### 3. `await expect(result).toSatisfyJudge(NameJudge)` — LAST RESORT.

Only when the deliverable is free-form text reasoning that
can't be checked structurally. Each judge tests **one
property**.

```ts
await expect(result).toSatisfyJudge(IdentifiesPrivilegedTriggerJudge);
```

**Aim for ≤2 judges per case.** Every judge is an LLM call at
test time; structural checks are free.

## Banned

**Regex or substring matching against `result.session.outputText`
is banned.** That includes:

- `expect(result.session.outputText).toMatch(/.../)`
- `expect(result.session.outputText).toContain("...")`
- `expect(result.session.outputText).not.toContain("...")`

The agent's chat output paraphrases between runs. Regex on
free-form text is a brittle proxy that fails or passes for the
wrong reasons. If the property is structurable, use the skill's
structured output. If it isn't, write a narrow named judge.

## Caps

1. **Per-file cap: ≤3 judges referenced.** More than that almost
   always means you're using judges where structural would
   work. Look at every judge and ask: "could this be a
   tool-args check or an output-match-object check instead?"
2. **Aim for ≤2 judges per case.** Structural checks are free;
   judges are LLM calls.
3. **Judge criterion text ≤200 characters.** Tight, one-property
   rubric — 1-2 sentences.
4. **Every declared judge in `_judges.ts` is referenced.** No
   dead judge declarations. The validator flags orphans.
5. **Every case with tool-using behavior MUST have at least
   one structural tool-call assertion.** If the agent is
   expected to read a file, call a specific helper, or avoid a
   dangerous tool — pin that with `toContain` / `toContainEqual`
   BEFORE adding judges. This is the single biggest lever on
   eval quality. **No exceptions for prose-output skills.** A
   skill that produces free-form prose still does work — reads
   files, runs greps, follows references — and that work is
   structurally checkable. A case that only has judges and no
   tool-call assertion is almost always under-specified: ask
   what the agent must DO before what it says, and pin the
   doing.

## How to pick

| The skill does this… | Use |
|----------------------|-----|
| emits structured output (JSON/YAML/keyed shape on `result.output`) | `toMatchObject` for every property you can pin (severity, trigger, file path, status), then a judge for the prose reasoning if any |
| traces a path through tools (read file → identify pattern → flag) | `toolCalls` `toContainEqual` to assert the trace. Cheap, deterministic, proves real work |
| produces free-form prose reasoning as THE deliverable | First, pin the work the agent had to do — `toolCalls` `toContainEqual` for any file the agent must read, any reference it must consult, any helper it must invoke. THEN add ≤1 narrow judge for the prose verdict. One property per judge — don't bundle "identifies trigger AND rates severity AND recommends fix" into one judge |

The order above is the priority. Judges are the fallback, not
the default.

## Worked example — prose deliverable, structural + judge mix

```ts
it(
  "report-pwn-request__pr-target-checkout",
  { timeout: 120_000 },
  async ({ run }) => {
    const cwd = createWorkspace(skillRoot, "report-pwn-request__pr-target-checkout");
    const result = await run("Audit .github/workflows/ci.yml for security issues.", { metadata: { cwd } });

    // Prove the agent traced the chain.
    const calls = toolCalls(result.session);
    expect(calls).toContainEqual(
      expect.objectContaining({
        name: "read_file",
        arguments: expect.objectContaining({ path: ".github/workflows/ci.yml" }),
      }),
    );

    // Grade the prose verdict.
    await expect(result).toSatisfyJudge(ConnectsExploitChainJudge);
  },
);
```

Two assertions. One LLM call at test time instead of three or
four.

## Worked example — structural-first

When the skill emits a structured finding shape on
`result.output`:

```ts
it(
  "report-pwn-request__structured",
  { timeout: 120_000 },
  async ({ run }) => {
    const cwd = createWorkspace(skillRoot, "report-pwn-request__structured");
    const result = await run("Audit .github/workflows/ci.yml; output JSON.", { metadata: { cwd } });

    expect(result.output).toMatchObject({
      severity: "HIGH",
      trigger: "pull_request_target",
    });

    const names = toolCalls(result.session).map((c) => c.name);
    expect(names).toContain("read_file");

    await expect(result).toSatisfyJudge(ExploitChainExplanationJudge);
  },
);
```

When output is structurable, two structural assertions plus one
judge for the prose-y reasoning is the cleanest shape.

## Worked example — must_not (no false positives)

Must_nots get judges too — one for "did NOT do the wrong thing"
and one for "DID emit the right neutral framing."

```ts
it(
  "no-numeric-id-injection__pr-number-in-comment",
  { timeout: 90_000 },
  async ({ run }) => {
    const result = await run(
      "Anything risky about ${{ github.event.pull_request.number }} used in the run command here?",
    );

    await expect(result).toSatisfyJudge(NoFalsePositiveOnNumericIdJudge);
    await expect(result).toSatisfyJudge(ExplainsSafeResolvedValueJudge);
  },
);
```

## Realistic prompts

Imagine a real user typing into a chat with the skill loaded.
Don't preview the answer in the prompt. Don't include
boilerplate like "please carefully analyze" — that's
prompt-as-test contamination.

## Must_not awareness when constructing fixtures

When a case has a fixture, ensure that fixture doesn't
accidentally trip a different `must_not` rule from the same
spec. A positive case must test the rule under test — not
incidentally trigger another.
