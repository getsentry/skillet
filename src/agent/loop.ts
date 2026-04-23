import { complete, validateToolCall } from "@mariozechner/pi-ai";
import type { Context } from "@mariozechner/pi-ai";
import { createToolDefs, executeTool } from "./tools.js";
import type { AnyModel } from "./provider.js";
import type { Skill } from "../skill/loader.js";
import type { NormalizedMessage } from "../eval/types.js";

const isRecord = (v: unknown): v is Record<string, unknown> => {
  return v != null && typeof v === "object" && !Array.isArray(v);
};

export interface AgentRunOptions {
  model: AnyModel;
  skill: Skill;
  workDir: string;
  turns: string[];
  timeout: number;
}

export interface AgentRunResult {
  /** Concatenated text output from all turns */
  output: string;
  /** Number of tool calls made across all turns */
  toolCallCount: number;
  /** Full conversation transcript as normalized messages */
  messages: NormalizedMessage[];
}

const MAX_STEPS = 50;

/**
 * Run the agent loop: send turns sequentially, handle tool calls,
 * collect text output.
 */
export const runAgent = async (opts: AgentRunOptions): Promise<AgentRunResult> => {
  const { model, skill, workDir, turns, timeout } = opts;
  const tools = createToolDefs();

  const systemPrompt = buildSystemPrompt(skill, workDir);
  const outputs: string[] = [];
  const transcript: NormalizedMessage[] = [];
  let totalToolCalls = 0;

  const context: Context = {
    systemPrompt,
    messages: [],
    tools,
  };

  for (const turn of turns) {
    context.messages.push({
      role: "user",
      content: turn,
      timestamp: Date.now(),
    });
    transcript.push({ role: "user", content: turn });

    // Run completion loop: call model, execute tools, repeat
    let steps = 0;
    while (steps < MAX_STEPS) {
      steps++;

      const response = await Promise.race([
        complete(model, context, { temperature: 0 }),
        timeoutPromise(timeout),
      ]);

      // Add assistant message to context
      context.messages.push(response);

      // Collect text output — narrow via type guard instead of `as` cast
      const textParts = response.content
        .filter(
          (b): b is { type: "text"; text: string; textSignature?: string } => b.type === "text",
        )
        .map((b) => b.text);
      const assistantText = textParts.join("");
      if (textParts.length > 0) {
        outputs.push(assistantText);
      }
      transcript.push({ role: "assistant", content: assistantText });

      // Check for tool calls
      const toolCalls = response.content.filter((b) => b.type === "toolCall");
      if (toolCalls.length === 0 || response.stopReason !== "toolUse") {
        break; // No tool calls, done with this turn
      }

      // Execute each tool call and add results to context
      for (const block of toolCalls) {
        if (block.type !== "toolCall") continue;
        totalToolCalls++;

        let resultText: string;
        let isError = false;
        try {
          // validateToolCall is typed as `any` in pi-ai; wrap to a safe shape
          const validated: unknown = validateToolCall(tools, block);
          const args: Record<string, unknown> = isRecord(validated) ? validated : {};
          resultText = executeTool(workDir, block.name, args);
        } catch (err: unknown) {
          const message =
            err instanceof Error
              ? err.message
              : typeof err === "string"
                ? err
                : JSON.stringify(err);
          resultText = `Error: ${message}`;
          isError = true;
        }

        context.messages.push({
          role: "toolResult",
          toolCallId: block.id,
          toolName: block.name,
          content: [{ type: "text", text: resultText }],
          isError,
          timestamp: Date.now(),
        });
        transcript.push({
          role: "tool",
          content: resultText,
          metadata: { name: block.name },
        });
      }
    }
  }

  return {
    output: outputs.join("\n\n"),
    toolCallCount: totalToolCalls,
    messages: transcript,
  };
};

const buildSystemPrompt = (skill: Skill, workDir: string): string => {
  return `You are an AI coding agent executing a task in a workspace.

Working directory: ${workDir}

Your behavior is guided by the following skill instructions. Follow them precisely.

---

${skill.body}`;
};

const timeoutPromise = (ms: number): Promise<never> => {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Agent timed out after ${ms}ms`));
    }, ms);
  });
};
