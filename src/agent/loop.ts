import { generateText, stepCountIs } from "ai";
import type { LanguageModel } from "ai";
import { createTools } from "./tools.js";
import type { Skill } from "../skill/loader.js";

export interface AgentRunOptions {
  model: LanguageModel;
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

/**
 * Run the agent loop: send turns sequentially, handle tool calls,
 * collect text output.
 */
export async function runAgent(opts: AgentRunOptions): Promise<AgentRunResult> {
  const { model, skill, workDir, turns, timeout } = opts;
  const tools = createTools(workDir);

  const systemPrompt = buildSystemPrompt(skill, workDir);
  const outputs: string[] = [];
  let totalToolCalls = 0;

  // Build up conversation history across turns
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (const turn of turns) {
    messages.push({ role: "user", content: turn });

    const result = await Promise.race([
      generateText({
        model,
        system: systemPrompt,
        messages,
        tools,
        stopWhen: stepCountIs(50),
        temperature: 0,
      }),
      timeoutPromise(timeout),
    ]);

    // Count tool calls from steps
    if (result.steps) {
      for (const step of result.steps) {
        if (step.toolCalls) {
          totalToolCalls += step.toolCalls.length;
        }
      }
    }

    // Capture text output
    if (result.text) {
      outputs.push(result.text);
      messages.push({ role: "assistant", content: result.text });
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
