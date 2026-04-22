import { complete, validateToolCall } from "@mariozechner/pi-ai";
import type { Model, Context, Tool, AssistantMessage } from "@mariozechner/pi-ai";
import { createToolDefs, executeTool } from "./tools.js";
import type { Skill } from "../skill/loader.js";

export interface AgentRunOptions {
  model: Model<any>;
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
}

const MAX_STEPS = 50;

/**
 * Run the agent loop: send turns sequentially, handle tool calls,
 * collect text output.
 */
export async function runAgent(opts: AgentRunOptions): Promise<AgentRunResult> {
  const { model, skill, workDir, turns, timeout } = opts;
  const tools = createToolDefs();

  const systemPrompt = buildSystemPrompt(skill, workDir);
  const outputs: string[] = [];
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

      // Collect text output
      const textParts = response.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text);
      if (textParts.length > 0) {
        outputs.push(textParts.join(""));
      }

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
          const validated = validateToolCall(tools, block);
          resultText = executeTool(workDir, block.name, validated);
        } catch (err: any) {
          resultText = `Error: ${err.message}`;
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
      }
    }
  }

  return {
    output: outputs.join("\n\n"),
    toolCallCount: totalToolCalls,
  };
}

function buildSystemPrompt(skill: Skill, workDir: string): string {
  return `You are an AI coding agent executing a task in a workspace.

Working directory: ${workDir}

Your behavior is guided by the following skill instructions. Follow them precisely.

---

${skill.body}`;
}

function timeoutPromise(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Agent timed out after ${ms}ms`)), ms)
  );
}
