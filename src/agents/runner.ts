/**
 * Single agent runner. Loads a bundled agent's SKILL.md, builds a
 * scoped tool executor that enforces the agent's read/write policy
 * against `ctx.readScope`/`writeScope`, and drives the loop via
 * `runToolLoop` (the same primitive spec-author uses).
 *
 * Knows nothing about the orchestrator's writer/validator
 * sequencing or about diagnostic parsing — those concerns live
 * one layer up.
 */

import type { Context, Tool } from "@mariozechner/pi-ai";
import { resolve } from "node:path";
import type { AnyModel } from "../agent/provider.js";
import { submitAiJob } from "../agent/queue.js";
import { buildScope, isInScope, type ResearchScope } from "../agent/scope.js";
import { runToolLoop } from "../agent/tool-loop.js";
import { createToolDefs, executeTool } from "../agent/tools.js";
import { loadSkill } from "../skill/loader.js";
import type { AgentDefinition, AgentRunContext, AgentRunResult } from "./types.js";

const DEFAULT_MAX_TOOL_CALLS = 40;
const PER_TURN_DEADLINE_MS = 15 * 60_000;
const SESSION_DEADLINE_MS = 30 * 60_000;

/**
 * Names of the read-only filesystem tools. Validators are filtered
 * down to this set; writers also receive `write_file` and
 * `edit_file`. No agent ever receives `bash`.
 */
const READ_TOOL_NAMES: ReadonlySet<string> = new Set(["read_file", "list_files", "grep"]);
const WRITE_TOOL_NAMES: ReadonlySet<string> = new Set(["write_file", "edit_file"]);

/**
 * Filter the full tool defs down to the agent's allowed surface.
 * Writers: read tools + write tools. Validators: read tools only.
 * Bash is dropped for both — authoring agents never need to shell
 * out.
 */
const buildAllowedTools = (def: AgentDefinition): Tool[] => {
  const all = createToolDefs();
  return all.filter((t) => {
    if (READ_TOOL_NAMES.has(t.name)) return true;
    if (def.tools.canWrite && WRITE_TOOL_NAMES.has(t.name)) return true;
    return false;
  });
};

/**
 * Build a scoped executor that:
 * - allows reads against `ctx.readScope` ∪ skill root ∪ agent
 *   bundle (the agent's own references resolve via `executeTool`'s
 *   skillRoot parameter).
 * - allows writes against `ctx.writeScope` only (which must be a
 *   subset of skill root).
 * - rejects out-of-scope path arguments with a tool error rather
 *   than crashing the process.
 */
const buildScopedExecutor = (
  def: AgentDefinition,
  ctx: AgentRunContext,
  readScope: ResearchScope,
  writeScope: ResearchScope,
): ((name: string, args: Record<string, unknown>) => string) => {
  return (name, args) => {
    const rawPath = typeof args.path === "string" ? args.path : "";

    // Reads/lists/greps: check readScope. Special-case
    // `references/<name>.md` — those resolve against the agent's
    // bundle directory (so agents can read their own bundled
    // references via the same tool surface).
    if (READ_TOOL_NAMES.has(name)) {
      if (rawPath !== "" && !isReferencePath(rawPath)) {
        const absolute = resolve(readScope.defaultBase, rawPath);
        if (!isInScope(readScope, absolute)) {
          return outOfScopeError(rawPath, readScope, "read");
        }
      }
      return executeTool(ctx.skillRoot, name, args, def.bundleRoot);
    }

    // Writes/edits: check writeScope. References and bundle paths
    // are never writable.
    if (WRITE_TOOL_NAMES.has(name)) {
      if (!def.tools.canWrite) {
        return `Error: tool "${name}" is not allowed for ${def.name} (read-only validator).`;
      }
      if (rawPath === "") {
        return `Error: tool "${name}" requires a non-empty 'path' argument.`;
      }
      const absolute = resolve(ctx.skillRoot, rawPath);
      if (!isInScope(writeScope, absolute)) {
        return outOfScopeError(rawPath, writeScope, "write");
      }
      return executeTool(ctx.skillRoot, name, args);
    }

    return `Error: tool "${name}" is not available to agent ${def.name}.`;
  };
};

/** Regex matches `references/<slug>.md` — agent's own bundle refs. */
const isReferencePath = (path: string): boolean => {
  return path === "references" || /^references\/[a-z0-9][a-z0-9./-]*\.md$/i.test(path);
};

const outOfScopeError = (path: string, scope: ResearchScope, mode: "read" | "write"): string => {
  const allowed = scope.roots.map((r) => `  - ${r}`).join("\n");
  return `Error: path '${path}' is outside the ${mode} scope. Allowed roots:\n${allowed}`;
};

/**
 * Append the orchestrator's "Operating Context" footer to the
 * agent's bundled SKILL.md body. The agent already knows how to
 * author from its own SKILL.md; the footer just tells it which
 * skill it's working on this run, where it may read/write, and
 * any extra context (validator findings, failing evals).
 */
const buildSystemPrompt = (
  agentBody: string,
  ctx: AgentRunContext,
  readRoots: string[],
  writeRoots: string[],
): string => {
  const readLines = readRoots.length > 0 ? readRoots.map((r) => `- ${r}`).join("\n") : "(none)";
  const writeLines =
    writeRoots.length > 0 ? writeRoots.map((r) => `- ${r}`).join("\n") : "(read-only)";
  const extra =
    ctx.extraContext != null && ctx.extraContext.trim() !== ""
      ? `\n\n## Additional Context\n\n${ctx.extraContext.trim()}`
      : "";
  return `${agentBody.trim()}

---

## Operating Context

Skill root: ${ctx.skillRoot}

Read scope (paths you may read via read_file/list_files/grep):
${readLines}

Write scope (paths you may write/edit; out-of-scope writes are rejected):
${writeLines}

Bundled references for this agent are reachable as relative paths under \`references/\` (e.g. \`read_file path=references/foo.md\`); they resolve against the agent's bundle, not the workspace.${extra}`;
};

/**
 * Drive a bundled agent for one orchestration step. Submits through
 * `submitAiJob` so the AI queue throttles parallel agents.
 */
export const runAgent = async (
  model: AnyModel,
  def: AgentDefinition,
  ctx: AgentRunContext,
): Promise<AgentRunResult> => {
  // Load the agent's bundled SKILL.md as a proper Anthropic Agent
  // Skill (frontmatter + body). The body becomes the agent's system
  // prompt; references/ files are reachable via read_file.
  const agentSkill = loadSkill(def.bundleRoot);
  const agentBody = agentSkill.body;

  // Read scope: skill root + agent bundle + any extra paths the
  // caller wants to expose. Agent bundle is included so
  // `read_file path=references/foo.md` (which resolves against the
  // bundle inside executeTool) doesn't trip the scope check.
  // Use buildScope so roots are canonicalized via realpath — on
  // macOS /tmp → /private/tmp and a non-canonical root would
  // reject every read against that path.
  const readScope = buildScope(
    uniq([ctx.skillRoot, def.bundleRoot, ...(ctx.readScope ?? [])]),
  );
  // Write scope: caller-specified only. Empty for validators.
  const writeScope: ResearchScope =
    ctx.writeScope.length > 0
      ? buildScope(uniq(ctx.writeScope))
      : { roots: [], defaultBase: ctx.skillRoot };

  const tools = buildAllowedTools(def);
  const executor = buildScopedExecutor(def, ctx, readScope, writeScope);
  const systemPrompt = buildSystemPrompt(
    agentBody,
    ctx,
    readScope.roots,
    writeScope.roots,
  );

  const context: Context = {
    systemPrompt,
    messages: [
      {
        role: "user",
        content: "Begin.",
        timestamp: Date.now(),
      },
    ],
    tools,
  };

  const sessionDeadline = Date.now() + SESSION_DEADLINE_MS;
  const result = await submitAiJob({
    name: `agent:${def.name}`,
    timeoutMs: SESSION_DEADLINE_MS,
    run: (signal) =>
      runToolLoop({
        model,
        context,
        executeTool: executor,
        deadline: Math.min(sessionDeadline, Date.now() + PER_TURN_DEADLINE_MS),
        maxToolCalls: def.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS,
        signal: combineSignals(ctx.signal, signal),
      }),
  });

  if (result.endReason === "error") {
    throw new Error(`agent ${def.name}: LLM returned error: ${result.errorMessage ?? "unknown"}`);
  }
  if (result.endReason === "max-tool-calls") {
    throw new Error(
      `agent ${def.name}: tool budget (${def.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS}) exhausted before terminal output`,
    );
  }

  return {
    terminalText: result.finalText,
    toolCallCount: result.toolCallCount,
  };
};

const uniq = (paths: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paths) {
    if (!seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
};

/**
 * Combine an outer signal with the AI queue's job signal so
 * either firing aborts the loop. Returns the queue signal alone
 * when the outer one is undefined.
 */
const combineSignals = (outer: AbortSignal | undefined, inner: AbortSignal): AbortSignal => {
  if (outer == null) return inner;
  const ctrl = new AbortController();
  const onAbort = (): void => ctrl.abort();
  outer.addEventListener("abort", onAbort, { once: true });
  inner.addEventListener("abort", onAbort, { once: true });
  if (outer.aborted || inner.aborted) ctrl.abort();
  return ctrl.signal;
};
