# Design

## Shared Tool Kernel

Today `src/agent/loop.ts:runAgent` does several things:

1. Sets up tools and executor.
2. Runs an LLM↔tool dance (tool calls → execute → feed results → repeat).
3. Builds an eval-specific system prompt from a `Skill` object.
4. Iterates over a sequence of user "turns" provided by the eval case.
5. Tracks a normalized transcript for downstream judging.

Pieces 1–2 are the reusable kernel. Pieces 3–5 are eval-runtime concerns.

We extract a minimal kernel:

```ts
// src/agent/tool-loop.ts
export interface ToolLoopOptions {
  model: AnyModel;
  systemPrompt: string;
  tools: Tool[];
  executeTool: (name: string, args: Record<string, unknown>) => string;
  /** Initial conversation. The kernel appends to it. */
  messages: Message[];
  /** Deadline for the entire kernel call. */
  deadline: number;
  /** Per-call max tool invocations. */
  maxToolCalls: number;
  /** Called on each tool execution for visibility. */
  onToolCall?: (name: string) => void;
}

export interface ToolLoopResult {
  /** Final assistant text (when stopReason !== "toolUse"). */
  text: string;
  /** Tool-call summary for caller presentation. */
  toolCallCount: number;
  /** Updated message history including all tool calls/results. */
  messages: Message[];
}

export const runToolLoop = (opts: ToolLoopOptions): Promise<ToolLoopResult>;
```

`runAgent` becomes a thin wrapper that builds the eval system prompt,
iterates over case turns, and calls `runToolLoop` once per turn.

`runSpecAuthor` calls `runToolLoop` once per author-turn, then parses the
returned text as `{ patches, questions, commit_request }` (with retry on
parse failure — same retry shape we already use elsewhere).

## Tool Subset for Spec-Author

```
read_file    — read a file in the research scope
list_files   — list a directory in the research scope
grep         — regex search across the research scope
```

Excluded by design:
- `bash` — too broad; agent could mutate state
- `write_file` / `edit_file` — spec writes happen via patches, not direct
- network tools — non-determinism cost, deferred

The same `executeTool` from `src/agent/tools.ts` already handles all three
reads safely. We just register a different tool *list* for the spec-author
caller, even though the executor is shared.

## Research Scope

The scope is the set of root directories the agent's tools can read from.
It is composed at session start and remains stable for the session
(survives resume).

Composition:

| Source                                | Always present? |
|---------------------------------------|-----------------|
| Skillet's bundled `references/`       | Yes             |
| Target skill root (if it exists yet)  | When applicable |
| User `--input <path>` flags           | When supplied   |
| CWD                                   | Only when no `--input` was given |

The CWD default is for the common case "I'm in my repo, run skillet, plan
a skill about this repo." When the user is explicit with `--input`, we
respect that and do not auto-include CWD (avoids accidentally pulling in
unrelated files from wherever the user happens to be).

The scope is stored on the session as `inputPaths: string[]` so resume
gets the same view.

`executeTool` is path-agnostic; we enforce scope by passing the kernel's
working directory (the *first* scope path) and overriding tool execution
to reject paths outside the union. A small wrapper around `executeTool`
takes the scope set and validates resolved absolute paths against it
before delegating.

## Turn Output

Unchanged from plan-driven-authoring:

```json
{
  "patches": [...],
  "questions": [...],
  "commit_request": false
}
```

What changes is *how* the agent decides what to put there. Now it can
ground each proposal in actual file content. The prompt update tells the
agent to:

- Investigate before proposing — when the user names a directory, read it.
- Cite specific evidence in patch rationales when relevant ("flag the N+1
  in `views.py:list_books`").
- Stop investigating when expansion passes diminish returns; emit
  proposals.

## Budgets

Two caps prevent run-away exploration:

- **Per-turn**: `maxToolCalls: 30`. Default chosen so a thoughtful
  read+grep+read sequence has headroom but a tool-loop bug surfaces.
- **Per-session**: `maxSessionToolCalls: 100`. Prevents a turn cap from
  being circumvented by unbounded turn count.

When a cap is hit, the kernel injects a synthetic user message:
`"Tool budget reached — please conclude with your patches/questions."`
The next LLM call should produce terminal output. If it tries another
tool call, we end the loop and surface a clear error.

## Resume Compatibility

Tool calls and tool results are pi-ai `Message` content blocks. JSON
round-trips them as plain objects. The session file already persists the
full message history, so resume picks up mid-turn (after a question)
without losing prior tool-call evidence.

The one wrinkle: if a paused session is resumed but the *original input
paths no longer exist on disk* (the user moved their repo), the agent's
next tool calls will error. We surface this as a tool error like any
other; the agent can either ask the user (which raises a question and
re-pauses) or work around it. Not a special case.

## Prompt Update

The spec-author prompt gets a new section:

```
## Investigation

You have read-only tools (read_file, list_files, grep) over the research
scope shown below. Use them when proposing changes. Reading the user's
inputs is not optional — claim no familiarity until you've read.

When the description names a topic (a framework, an API, a directory),
your first move should be to read or list the relevant inputs. Cite
specific files in patch rationales when the citation matters.

Stop investigating when further reads add no new information. Then emit
your patches/questions/commit_request.

Research scope:
- skillet bundled references: <list>
- target skill root: <path or "(not yet created)">
- user inputs: <list of --input paths>
```

## Risks and Alternatives

**Risk: cost.** Tool use multiplies API calls. Mitigation: per-turn cap.
We can also wire the existing eval-runtime telemetry to record spec-author
tool counts, so we can tune.

**Risk: kernel refactor breaks eval-runtime.** Mitigation: extract the
kernel as a pure refactor first, with no behavior change in
`src/agent/loop.ts`. Run existing eval suite to confirm. Only then plug
spec-author into the kernel.

**Risk: scope misconfiguration leaks paths.** Mitigation: scope wrapper
rejects any tool call whose resolved absolute path falls outside the
declared roots. Test for this explicitly.

**Alternative: free-form filesystem access.** Rejected — spec-author has
no business writing files; the spec is its only output channel, and
patches are how it influences the world.

**Alternative: web fetch in v1.** Rejected — adds non-determinism and
auth surface. Worth doing once filesystem-only is solid and we have a
real demand signal.
