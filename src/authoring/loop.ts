import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { complete } from "@mariozechner/pi-ai";
import type { Context } from "@mariozechner/pi-ai";
import { resolveModels } from "../agent/provider.js";
import type { AnyModel } from "../agent/provider.js";
import { loadSkill } from "../skill/loader.js";
import { runEvals } from "../eval/index.js";
import type { EvalRunResult } from "../eval/index.js";
import { buildSkillGenPrompt, buildAssessmentPrompt } from "./prompts.js";
import { generateEvalYaml } from "./eval-gen.js";

// ── Types ─────────────────────────────────────────────────

export type AuthorMode = "create" | "improve";

export interface AuthorSkillOptions {
  mode: AuthorMode;
  /** Natural-language description (required for create, optional for improve) */
  description?: string;
  /** Path to skill directory */
  path: string;
  /** Maximum iterations (default: 3) */
  maxIterations?: number;
}

export interface AuthorSkillResult {
  skillRoot: string;
  iterations: number;
  finalEvalResult?: EvalRunResult;
  success: boolean;
}

interface AssessmentResult {
  skillChanges: string | null;
  evalChanges: string | null;
  assessment: string;
}

// ── Orchestrator ──────────────────────────────────────────

const DEFAULT_MAX_ITERATIONS = 3;

/**
 * Main authoring loop: generate/improve a skill and its evals,
 * run evals, and iterate until passing or max iterations reached.
 */
export const authorSkill = async (opts: AuthorSkillOptions): Promise<AuthorSkillResult> => {
  const { mode, path: skillPath, description } = opts;
  const maxIterations = opts.maxIterations ?? DEFAULT_MAX_ITERATIONS;

  const models = resolveModels();
  const skillMdPath = join(skillPath, "SKILL.md");
  const evalsDir = join(skillPath, "evals");

  // Phase 1: Generate or read SKILL.md
  if (mode === "create") {
    if (description == null || description === "") {
      throw new Error("Description is required for create mode");
    }
    console.log("Generating SKILL.md...");
    const skillContent = await generateSkillMd(models.agent, description);
    mkdirSync(skillPath, { recursive: true });
    writeFileSync(skillMdPath, skillContent, "utf-8");
    console.log(`  Written to ${skillMdPath}`);
  }

  // Phase 2: Generate evals if none exist
  if (!existsSync(evalsDir) || !hasEvalFiles(evalsDir)) {
    console.log("Generating eval cases...");
    const skillContent = readFileSync(skillMdPath, "utf-8");
    const evalYaml = await generateEvalYaml(models.agent, skillContent);
    mkdirSync(evalsDir, { recursive: true });
    const evalPath = join(evalsDir, "basic.eval.yaml");
    writeFileSync(evalPath, evalYaml, "utf-8");
    console.log(`  Written to ${evalPath}`);
  }

  // Phase 3: Run evals and iterate
  let lastEvalResult: EvalRunResult | undefined;

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    console.log(`\nIteration ${iteration}/${maxIterations}`);
    console.log("Running evals...");

    const skill = loadSkill(skillPath);
    lastEvalResult = await runEvals({
      skill,
      agentModel: models.agent,
      judgeModel: models.judge,
      onCaseComplete: (result) => {
        const icon = result.status === "pass" ? "✓" : result.status === "fail" ? "✗" : "○";
        console.log(`  ${icon} ${result.name}`);
      },
    });

    const { summary } = lastEvalResult;
    console.log(`  Results: ${summary.pass}/${summary.total} passed`);

    // All passed — done
    if (summary.fail === 0 && summary.error === 0) {
      console.log("\nAll evals passing.");
      return {
        skillRoot: skillPath,
        iterations: iteration,
        finalEvalResult: lastEvalResult,
        success: true,
      };
    }

    // Last iteration — don't assess, just report
    if (iteration === maxIterations) {
      break;
    }

    // Phase 4: Assess and improve
    console.log("Assessing failures...");
    const skillContent = readFileSync(skillMdPath, "utf-8");
    const assessment = await assessResults(models.agent, skillContent, lastEvalResult);
    console.log(`  Assessment: ${assessment.assessment}`);

    if (assessment.skillChanges != null) {
      console.log("Regenerating SKILL.md...");
      const improved = await improveSkillMd(models.agent, skillContent, assessment.skillChanges);
      writeFileSync(skillMdPath, improved, "utf-8");
    }

    if (assessment.evalChanges != null) {
      console.log("Regenerating evals...");
      const newSkillContent = readFileSync(skillMdPath, "utf-8");
      const newEvalYaml = await generateEvalYaml(models.agent, newSkillContent);
      writeFileSync(join(evalsDir, "basic.eval.yaml"), newEvalYaml, "utf-8");
    }
  }

  console.log(`\nMax iterations reached with failures remaining.`);
  return {
    skillRoot: skillPath,
    iterations: maxIterations,
    finalEvalResult: lastEvalResult,
    success: false,
  };
};

// ── LLM Phases ────────────────────────────────────────────

const generateSkillMd = async (model: AnyModel, description: string): Promise<string> => {
  const context: Context = {
    systemPrompt: buildSkillGenPrompt(),
    messages: [
      {
        role: "user",
        content: `Create a SKILL.md for the following skill:\n\n${description}`,
        timestamp: Date.now(),
      },
    ],
  };

  const response = await complete(model, context, { temperature: 0 });
  return extractText(response);
};

const improveSkillMd = async (
  model: AnyModel,
  currentSkill: string,
  changes: string,
): Promise<string> => {
  const context: Context = {
    systemPrompt: buildSkillGenPrompt(),
    messages: [
      {
        role: "user",
        content: `Improve this SKILL.md based on the following feedback:\n\n## Current SKILL.md\n\n${currentSkill}\n\n## Required Changes\n\n${changes}`,
        timestamp: Date.now(),
      },
    ],
  };

  const response = await complete(model, context, { temperature: 0 });
  return extractText(response);
};

const assessResults = async (
  model: AnyModel,
  skillContent: string,
  evalResult: EvalRunResult,
): Promise<AssessmentResult> => {
  const resultsText = formatEvalResultsForAssessment(evalResult);

  const context: Context = {
    systemPrompt: buildAssessmentPrompt(),
    messages: [
      {
        role: "user",
        content: `## SKILL.md\n\n${skillContent}\n\n## Eval Results\n\n${resultsText}`,
        timestamp: Date.now(),
      },
    ],
  };

  const response = await complete(model, context, { temperature: 0 });
  const text = extractText(response);

  try {
    const parsed: unknown = JSON.parse(stripFences(text));
    if (parsed != null && typeof parsed === "object" && "assessment" in parsed) {
      const obj = parsed as Record<string, unknown>;
      return {
        skillChanges: typeof obj.skillChanges === "string" ? obj.skillChanges : null,
        evalChanges: typeof obj.evalChanges === "string" ? obj.evalChanges : null,
        assessment: typeof obj.assessment === "string" ? obj.assessment : "No assessment provided",
      };
    }
  } catch {
    // Fall through to default
  }

  return {
    skillChanges: null,
    evalChanges: null,
    assessment: text.slice(0, 200),
  };
};

// ── Helpers ───────────────────────────────────────────────

const extractText = (response: { content: Array<{ type: string }> }): string => {
  return response.content
    .filter((b): b is { type: "text"; text: string; textSignature?: string } => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
};

const stripFences = (text: string): string => {
  const fenceMatch = /^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(text.trim());
  if (fenceMatch?.[1] != null) {
    return fenceMatch[1].trim();
  }
  return text;
};

const hasEvalFiles = (dir: string): boolean => {
  try {
    const entries = readdirSync(dir);
    return entries.some((e) => e.endsWith(".eval.yaml"));
  } catch {
    return false;
  }
};

const formatEvalResultsForAssessment = (result: EvalRunResult): string => {
  const lines: string[] = [];
  lines.push(
    `Total: ${result.summary.total}, Pass: ${result.summary.pass}, Fail: ${result.summary.fail}, Error: ${result.summary.error}`,
  );
  lines.push("");

  for (const c of result.cases) {
    lines.push(`### ${c.name} — ${c.status.toUpperCase()}`);

    if (c.checks.length > 0) {
      for (const check of c.checks) {
        const icon = check.passed ? "✓" : "✗";
        lines.push(`  ${icon} ${check.name}: ${check.detail}`);
      }
    }

    if (c.judge != null) {
      lines.push(`  Judge: ${c.judge.grade} (${c.judge.score}) — ${c.judge.reasoning}`);
    }

    if (c.errors.length > 0) {
      for (const err of c.errors) {
        lines.push(`  ERROR: ${err.message}`);
      }
    }

    lines.push("");
  }

  return lines.join("\n");
};
