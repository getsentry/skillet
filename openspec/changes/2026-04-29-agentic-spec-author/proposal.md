# Agentic Spec-Author Loop

## Motivation

The plan-driven-authoring change replaced single-shot spec generation with
an interactive loop, but the loop is text-only: the LLM sees the current
spec plus prior turns and answers, and proposes patches blind. It cannot
read the user's repo, examine prior skills as references, grep documentation,
or otherwise *investigate* before deciding what to put in the spec.

getsentry/skills' `skill-writer` produces deeper specs because the agent
performs synthesis — it reads files, looks at example code, traces APIs,
and then writes. We have a tool-using agent harness already
(`src/agent/loop.ts`), but it is wired only to eval runtime; the spec-author
loop ignores it entirely.

This change makes spec-author agentic: the LLM gets read-only filesystem
tools and a research-allowed path set, runs a tool-use cycle each turn
before emitting its structured turn output, and the user can supply
additional input paths (the codebase the skill is *about*, prior-art skill
directories, docs trees) via a `--input <path>` flag.

## Change

Plug a tool-use inner loop into `runSpecAuthor`. Each turn becomes:

1. Send the current spec + gates + history to the LLM with a read-only
   tool set.
2. Loop: while the LLM calls tools, execute them and feed results back.
3. When the LLM emits text, parse it as the existing turn output
   (`{ patches, questions, commit_request }`).
4. Same downstream behavior — apply patches, validate gates, ask questions
   or accept.

Backwards compatibility is not preserved: the text-only spec-author loop is
removed. There is no flag to disable tools — depth is the point.

## What Changes

- **Reusable tool kernel.** Extract the LLM↔tool inner loop from
  `src/agent/loop.ts` into `src/agent/tool-loop.ts` so spec-author and
  eval-runtime both call into it. Caller supplies tools, executor, system
  prompt, deadline, and a terminal-output predicate.
- **Read-only spec-author tools.** `read_file`, `list_files`, `grep`. Tools
  are scoped to a *research scope* (a list of allowed root paths). No write
  access, no shell, no network in v1.
- **Research scope.** Composed of: skillet's bundled `references/` (always
  available), the target skill root once it exists, and any user-supplied
  `--input <path>` directories. Default scope when no `--input` is given is
  the CWD.
- **CLI `--input <path>` flag** (repeatable) on `create`, `spec init`,
  `spec import`. Persisted in the session file so resume gets the same
  scope.
- **Tool-call budget.** Per turn cap (default 30 calls), per session cap
  (default 100). Exceeding either ends the turn with a synthetic user
  message asking the agent to wrap up its investigation.
- **Tool-call visibility in turn presentation.** The CLI shows a one-line
  summary of tools called per turn so the user can see what the agent
  investigated.
- **Session persistence covers tool calls.** The persisted `messages[]`
  already round-trips arbitrary pi-ai content blocks via JSON; tool-call
  and tool-result blocks are preserved by construction.
- **Prompt update.** The spec-author prompt instructs the agent to
  investigate before proposing — read inputs, grep prior art, examine
  references — and only emit patches once the investigation supports them.

## Capabilities Touched

- `skill-authoring` — converts the spec-author loop from text-only to
  tool-using.
- `cli` — adds `--input <path>` flag and tool-call summary in turn
  presentation.

## Non-Goals

- Web fetch / network tools. Filesystem-only in v1. Add `web_fetch` later if
  agents repeatedly want it.
- Persistent provenance (`SOURCES.md`). Skill-writer's audit log is a
  natural follow-up but not in scope here.
- Refactoring the eval-runtime agent's behavior. Eval-runtime stays as-is;
  the only change is that its inner loop now lives in the shared kernel.
- Tool-use during `improve`. Improve is prose-only by design and stays
  that way.
