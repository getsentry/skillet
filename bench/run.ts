/**
 * Cleanroom benchmark runner. Reads `bench/manifest.json`, runs
 * skillet's pipeline against each skill's frontmatter description
 * (no `--input` paths; pure description-only cleanroom), runs the
 * generated eval suite against the generated SKILL.md, and saves
 * artifacts + per-skill stats to `.skillet-bench/<label>/`.
 *
 * Usage:
 *
 *   tsx bench/run.ts [--label <name>] [--only <skill-id>] [--no-eval]
 *
 * --label:    subdirectory name under .skillet-bench/. Defaults to
 *             the ISO-date-time so successive runs accumulate.
 * --only:     filter to one skill from the manifest.
 * --no-eval:  skip running vitest evals after generation. Useful
 *             when iterating on the spec/generation layers and you
 *             only want artifact stats.
 *
 * Skills are run sequentially in one process so the AI queue can
 * throttle parallelism cleanly without N separate node processes
 * each spawning their own queue and stampeding the API.
 *
 * Exit code: 0 if every skill produced artifacts, 1 if any failed.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveModels } from "../src/agent/provider.ts";
import { orchestrate, type OrchestratorResult } from "../src/agents/orchestrator.ts";
import { seedFromDescription } from "../src/authoring/seed/index.ts";
import { runVitestEvals } from "../src/eval/vitest-runner.ts";
import type { EvalRunResult } from "../src/eval/types.ts";
import { specFileName, writeSpec } from "../src/spec/index.ts";

interface ManifestSkill {
  id: string;
  source: string;
  description: string;
  inputs?: string[];
}

interface Manifest {
  skills: ManifestSkill[];
}

interface SkillStats {
  id: string;
  ok: boolean;
  errorMessage?: string;
  elapsedMs: number;
  spec: {
    name: string;
    class: string;
    behaviors: number;
    must_nots: number;
    references: number;
    triggers_should: number;
  };
  artifacts: {
    skillMdLines: number | null;
    evalFiles: number;
    judges: number;
    fixtures: number;
    sourcesPresent: boolean;
  };
  agentRuns: Array<{
    agent: string;
    pass: number;
    toolCalls: number;
  }>;
  diagnostics: {
    skill: { ok: boolean; findings: number; errors: number };
    evals: { ok: boolean; findings: number; errors: number };
  };
  /** Heuristic checks. */
  checks: {
    namePreserved: boolean | null;
    behaviorsCoveredInSkillMd: number;
    behaviorsExpectedInSkillMd: number;
    evalCoverageRatio: number;
  };
  /**
   * Eval run results. Absent when generation failed or `--no-eval`
   * was passed. Per-case detail lives in `<skillDir>/_eval-result.json`
   * so this stats object stays compact.
   */
  evalRun?: {
    total: number;
    pass: number;
    fail: number;
    skip: number;
    error: number;
    passRate: number;
    durationMs: number;
    failingCases: string[];
  };
  evalRunError?: string;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const MANIFEST_PATH = join(HERE, "manifest.json");
const BENCH_OUT_DIR = join(REPO_ROOT, ".skillet-bench");

interface BenchArgs {
  label: string;
  only?: string;
  /** When false, skip running vitest evals after generation. */
  runEvals: boolean;
}

const parseArgs = (argv: string[]): BenchArgs => {
  const out: BenchArgs = {
    label: new Date().toISOString().replace(/[:.]/g, "-"),
    runEvals: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--label" && argv[i + 1] != null) {
      out.label = argv[i + 1] ?? "";
      i++;
    } else if (a === "--only" && argv[i + 1] != null) {
      out.only = argv[i + 1] ?? "";
      i++;
    } else if (a === "--no-eval") {
      out.runEvals = false;
    }
  }
  return out;
};

const loadManifest = (): Manifest => {
  const raw = readFileSync(MANIFEST_PATH, "utf-8");
  const parsed = JSON.parse(raw) as unknown;
  if (
    parsed == null ||
    typeof parsed !== "object" ||
    !("skills" in parsed) ||
    !Array.isArray((parsed as { skills: unknown }).skills)
  ) {
    throw new Error(`bench manifest at ${MANIFEST_PATH} missing "skills" array`);
  }
  return parsed as Manifest;
};

const countLines = (path: string): number | null => {
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf-8").split("\n").length;
};

const findFiles = (dir: string, suffix: string): string[] => {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const stack = [dir];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (cur == null) continue;
    let entries: string[];
    try {
      entries = readdirSync(cur);
    } catch {
      continue;
    }
    for (const name of entries) {
      const full = join(cur, name);
      try {
        const st = statSync(full);
        if (st.isDirectory()) stack.push(full);
        else if (suffix === "" || name.endsWith(suffix)) out.push(full);
      } catch {
        // skip
      }
    }
  }
  return out;
};

const collectStats = (
  skill: ManifestSkill,
  outDir: string,
  spec: { name: string; class: string; behaviors: number; must_nots: number; references: number; triggers_should: number; behaviorIds: string[] },
  result: OrchestratorResult | undefined,
  errorMessage: string | undefined,
  elapsedMs: number,
  evalRun: EvalRunResult | undefined,
  evalRunError: string | undefined,
): SkillStats => {
  const skillMdPath = join(outDir, "SKILL.md");
  const skillMd = existsSync(skillMdPath) ? readFileSync(skillMdPath, "utf-8") : null;
  const evalFiles = findFiles(join(outDir, "evals"), ".eval.ts");
  const judgesPath = join(outDir, "evals", "_judges.ts");
  const judgesSrc = existsSync(judgesPath) ? readFileSync(judgesPath, "utf-8") : "";
  const judgesCount = (judgesSrc.match(/^export const /gm) ?? []).length;
  const fixtures = findFiles(join(outDir, "evals", "fixtures"), "");
  const sourcesPath = join(outDir, "SOURCES.md");

  // Heuristic: count behavior IDs that appear as section markers
  // (H2 heading text or proximity to one) in SKILL.md. Loose match —
  // an exact "## <id>" is rare; we look for the id substring anywhere
  // in the body since skill-writer renames sections by topic.
  let coveredCount = 0;
  if (skillMd != null) {
    for (const id of spec.behaviorIds) {
      if (skillMd.includes(id)) coveredCount++;
    }
  }

  const skillFindings = result?.diagnostics.skill.findings ?? [];
  const evalFindings = result?.diagnostics.evals.findings ?? [];

  const stats: SkillStats = {
    id: skill.id,
    ok: result?.success === true,
    elapsedMs,
    spec: {
      name: spec.name,
      class: spec.class,
      behaviors: spec.behaviors,
      must_nots: spec.must_nots,
      references: spec.references,
      triggers_should: spec.triggers_should,
    },
    artifacts: {
      skillMdLines: countLines(skillMdPath),
      evalFiles: evalFiles.length,
      judges: judgesCount,
      fixtures: fixtures.length,
      sourcesPresent: existsSync(sourcesPath),
    },
    agentRuns: (result?.agentsRun ?? []).map((r) => ({
      agent: r.agent,
      pass: r.passNumber,
      toolCalls: r.toolCallCount,
    })),
    diagnostics: {
      skill: {
        ok: result?.diagnostics.skill.ok === true,
        findings: skillFindings.length,
        errors: skillFindings.filter((f) => f.severity === "error").length,
      },
      evals: {
        ok: result?.diagnostics.evals.ok === true,
        findings: evalFindings.length,
        errors: evalFindings.filter((f) => f.severity === "error").length,
      },
    },
    checks: {
      namePreserved: spec.name === skill.id,
      behaviorsCoveredInSkillMd: coveredCount,
      behaviorsExpectedInSkillMd: spec.behaviors,
      evalCoverageRatio:
        spec.behaviors + spec.must_nots > 0
          ? evalFiles.length / (spec.behaviors + spec.must_nots)
          : 0,
    },
  };
  if (errorMessage != null) stats.errorMessage = errorMessage;
  if (evalRun != null) {
    const total = evalRun.summary.total;
    stats.evalRun = {
      total,
      pass: evalRun.summary.pass,
      fail: evalRun.summary.fail,
      skip: evalRun.summary.skip,
      error: evalRun.summary.error,
      passRate: total > 0 ? evalRun.summary.pass / total : 0,
      durationMs: evalRun.summary.durationMs,
      failingCases: evalRun.cases
        .filter((c) => c.status === "fail" || c.status === "error")
        .map((c) => c.name),
    };
  }
  if (evalRunError != null) stats.evalRunError = evalRunError;
  return stats;
};

const runOne = async (
  skill: ManifestSkill,
  runDir: string,
  runEvals: boolean,
): Promise<SkillStats> => {
  const outDir = join(runDir, skill.id);
  mkdirSync(outDir, { recursive: true });

  console.log(`[${skill.id}] start`);
  const start = Date.now();
  const models = resolveModels();
  let errorMessage: string | undefined;
  let result: OrchestratorResult | undefined;

  let specSummary = {
    name: skill.id,
    class: "generic",
    behaviors: 0,
    must_nots: 0,
    references: 0,
    triggers_should: 0,
    behaviorIds: [] as string[],
  };

  try {
    const spec = await seedFromDescription(models.agent, skill.description);
    writeSpec(join(outDir, specFileName()), spec);
    const refCount = spec.references?.length ?? 0;
    specSummary = {
      name: spec.name,
      class: spec.class,
      behaviors: spec.behaviors.length,
      must_nots: spec.must_not.length,
      references: refCount,
      triggers_should: spec.triggers.should.length,
      behaviorIds: [...spec.behaviors.map((b) => b.id), ...spec.must_not.map((m) => m.id)],
    };
    console.log(
      `[${skill.id}] spec: name=${spec.name} class=${spec.class} ${spec.behaviors.length}b/${spec.must_not.length}mn/${refCount}refs`,
    );

    result = await orchestrate({
      skillRoot: outDir,
      mode: "create",
      model: models.agent,
      onProgress: (m) => console.log(`[${skill.id}]   ${m}`),
    });
    console.log(
      `[${skill.id}] orchestrator done: success=${result.success} skill-findings=${result.diagnostics.skill.findings.length} evals-findings=${result.diagnostics.evals.findings.length}`,
    );
  } catch (err: unknown) {
    errorMessage = err instanceof Error ? err.message : String(err);
    console.log(`[${skill.id}] FAILED: ${errorMessage}`);
  }

  // Run the generated eval suite against the generated SKILL.md so
  // the bench can report whether skillet's evals actually pass on
  // skillet's own output. Only when generation succeeded — running
  // evals on a partial/failed skill is wasted spend.
  let evalRun: EvalRunResult | undefined;
  let evalRunError: string | undefined;
  if (runEvals && result?.success === true && existsSync(join(outDir, "evals"))) {
    console.log(`[${skill.id}] eval: running vitest suite…`);
    const evalStart = Date.now();
    try {
      evalRun = await runVitestEvals({ skillRoot: outDir, streamProgress: false });
      writeFileSync(join(outDir, "_eval-result.json"), JSON.stringify(evalRun, null, 2));
      console.log(
        `[${skill.id}] eval: ${evalRun.summary.pass}/${evalRun.summary.total} pass (${(((Date.now() - evalStart) / 1000)).toFixed(1)}s)`,
      );
    } catch (err: unknown) {
      evalRunError = err instanceof Error ? err.message : String(err);
      console.log(`[${skill.id}] eval: FAILED — ${evalRunError}`);
    }
  } else if (runEvals && result?.success !== true) {
    console.log(`[${skill.id}] eval: skipped (generation did not succeed)`);
  }

  const elapsedMs = Date.now() - start;
  const stats = collectStats(skill, outDir, specSummary, result, errorMessage, elapsedMs, evalRun, evalRunError);
  writeFileSync(join(outDir, "_stats.json"), JSON.stringify(stats, null, 2));
  console.log(`[${skill.id}] done in ${(elapsedMs / 1000).toFixed(1)}s`);
  return stats;
};

const writeSummary = (
  runDir: string,
  label: string,
  stats: SkillStats[],
  modelId: string,
): void => {
  const lines: string[] = [];
  lines.push(`# Bench run \`${label}\``);
  lines.push("");
  lines.push(`- Model: \`${modelId}\``);
  lines.push(`- Skills: ${stats.length}`);
  lines.push(`- Succeeded: ${stats.filter((s) => s.ok).length}`);
  lines.push(`- Total wall-clock: ${(stats.reduce((a, s) => a + s.elapsedMs, 0) / 1000).toFixed(1)}s`);
  lines.push("");
  lines.push("## Per-skill summary");
  lines.push("");
  lines.push(
    "| skill | gen | spec | SKILL.md | evals | eval pass | sk-find err | ev-find err | secs |",
  );
  lines.push(
    "|-------|-----|------|----------|-------|-----------|-------------|-------------|------|",
  );
  for (const s of stats) {
    const expected = s.spec.behaviors + s.spec.must_nots;
    const evalPass = formatEvalPassCell(s);
    lines.push(
      `| ${s.id} | ${s.ok ? "✓" : "✗"} | ${s.spec.behaviors}b/${s.spec.must_nots}mn/${s.spec.references}r | ${s.artifacts.skillMdLines ?? "—"} | ${s.artifacts.evalFiles}/${expected} | ${evalPass} | ${s.diagnostics.skill.errors} (${s.diagnostics.skill.findings}) | ${s.diagnostics.evals.errors} (${s.diagnostics.evals.findings}) | ${(s.elapsedMs / 1000).toFixed(0)} |`,
    );
  }
  // Aggregate eval pass-rate across skills that produced one.
  const skillsWithEvals = stats.filter((s) => s.evalRun != null);
  if (skillsWithEvals.length > 0) {
    const totalCases = skillsWithEvals.reduce((a, s) => a + (s.evalRun?.total ?? 0), 0);
    const totalPass = skillsWithEvals.reduce((a, s) => a + (s.evalRun?.pass ?? 0), 0);
    const aggregateRate = totalCases > 0 ? (totalPass / totalCases) * 100 : 0;
    lines.push("");
    lines.push(
      `**Aggregate eval pass-rate:** ${totalPass}/${totalCases} (${aggregateRate.toFixed(1)}%) across ${skillsWithEvals.length} skill(s)`,
    );
  }
  lines.push("");
  const failed = stats.filter((s) => !s.ok || s.errorMessage != null);
  if (failed.length > 0) {
    lines.push("## Generation failures");
    lines.push("");
    for (const s of failed) {
      lines.push(`- **${s.id}**: ${s.errorMessage ?? "validator errors"}`);
    }
    lines.push("");
  }
  // Surface per-skill failing eval cases so a glance at the summary
  // tells you which behaviors regressed without opening _eval-result.json.
  const withFailingEvals = stats.filter(
    (s) => (s.evalRun?.failingCases.length ?? 0) > 0 || s.evalRunError != null,
  );
  if (withFailingEvals.length > 0) {
    lines.push("## Eval failures");
    lines.push("");
    for (const s of withFailingEvals) {
      if (s.evalRunError != null) {
        lines.push(`- **${s.id}**: eval suite failed to run — ${s.evalRunError}`);
        continue;
      }
      const cases = s.evalRun?.failingCases ?? [];
      lines.push(`- **${s.id}** (${cases.length} failing):`);
      for (const c of cases) lines.push(`  - ${c}`);
    }
  }
  writeFileSync(join(runDir, "_summary.md"), lines.join("\n"));
};

const formatEvalPassCell = (s: SkillStats): string => {
  if (s.evalRunError != null) return "ERR";
  if (s.evalRun == null) return "—";
  const { pass, total } = s.evalRun;
  if (total === 0) return "0/0";
  const pct = Math.round((pass / total) * 100);
  return `${pass}/${total} (${pct}%)`;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const manifest = loadManifest();
  const skills = args.only != null ? manifest.skills.filter((s) => s.id === args.only) : manifest.skills;
  if (skills.length === 0) {
    console.error(`No skills matched (--only ${args.only ?? "<none>"}).`);
    process.exit(2);
  }

  const runDir = join(BENCH_OUT_DIR, args.label);
  mkdirSync(runDir, { recursive: true });

  const models = resolveModels();
  const meta = {
    label: args.label,
    timestamp: new Date().toISOString(),
    model: models.agent.id,
    skills: skills.map((s) => s.id),
  };
  writeFileSync(join(runDir, "_meta.json"), JSON.stringify(meta, null, 2));

  console.log(`bench: label=${args.label} model=${models.agent.id} skills=${skills.map((s) => s.id).join(",")}`);
  console.log(`bench: output → ${runDir}`);
  if (!args.runEvals) console.log(`bench: --no-eval — skipping eval execution`);

  // Run sequentially. Each clean-room internally parallelizes via the
  // AI queue (writers + validators); running multiple in parallel
  // here would just stampede the rate limit.
  const stats: SkillStats[] = [];
  for (const skill of skills) {
    const s = await runOne(skill, runDir, args.runEvals);
    stats.push(s);
  }

  writeSummary(runDir, args.label, stats, models.agent.id);

  const failed = stats.filter((s) => !s.ok).length;
  console.log(`\nbench: ${stats.length - failed}/${stats.length} succeeded — summary at ${join(runDir, "_summary.md")}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("bench: fatal", e);
  process.exit(1);
});
