/**
 * Cleanroom benchmark runner. Reads `bench/manifest.json`, runs
 * skillet's pipeline against each skill's frontmatter description
 * (no `--input` paths; pure description-only cleanroom), and saves
 * artifacts + per-skill stats to `.skillet-bench/<label>/`.
 *
 * Usage:
 *
 *   tsx bench/run.ts [--label <name>] [--only <skill-id>]
 *
 * --label: subdirectory name under .skillet-bench/. Defaults to the
 *          ISO-date-time so successive runs accumulate without
 *          clobbering. Pass a meaningful label like "after-name-fix"
 *          when you want to compare specific runs.
 * --only:  filter to one skill from the manifest (run a single
 *          target while iterating).
 *
 * Skills are run sequentially in one process so the AI queue can
 * throttle parallelism cleanly without 6 separate node processes
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
}

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const MANIFEST_PATH = join(HERE, "manifest.json");
const BENCH_OUT_DIR = join(REPO_ROOT, ".skillet-bench");

const parseArgs = (argv: string[]): { label: string; only?: string } => {
  const out: { label: string; only?: string } = {
    label: new Date().toISOString().replace(/[:.]/g, "-"),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--label" && argv[i + 1] != null) {
      out.label = argv[i + 1] ?? "";
      i++;
    } else if (a === "--only" && argv[i + 1] != null) {
      out.only = argv[i + 1] ?? "";
      i++;
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
  return stats;
};

const runOne = async (skill: ManifestSkill, runDir: string): Promise<SkillStats> => {
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

  const elapsedMs = Date.now() - start;
  const stats = collectStats(skill, outDir, specSummary, result, errorMessage, elapsedMs);
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
    "| skill | ok | name preserved | spec | SKILL.md lines | eval files / expected | judges | sk-find err | ev-find err | secs |",
  );
  lines.push(
    "|-------|----|----------------|------|----------------|------------------------|--------|-------------|-------------|------|",
  );
  for (const s of stats) {
    const expected = s.spec.behaviors + s.spec.must_nots;
    lines.push(
      `| ${s.id} | ${s.ok ? "✓" : "✗"} | ${s.checks.namePreserved == null ? "?" : s.checks.namePreserved ? "✓" : `✗ → ${s.spec.name}`} | ${s.spec.behaviors}b/${s.spec.must_nots}mn/${s.spec.references}r | ${s.artifacts.skillMdLines ?? "—"} | ${s.artifacts.evalFiles}/${expected} | ${s.artifacts.judges} | ${s.diagnostics.skill.errors} (${s.diagnostics.skill.findings}) | ${s.diagnostics.evals.errors} (${s.diagnostics.evals.findings}) | ${(s.elapsedMs / 1000).toFixed(0)} |`,
    );
  }
  lines.push("");
  const failed = stats.filter((s) => !s.ok || s.errorMessage != null);
  if (failed.length > 0) {
    lines.push("## Failures");
    lines.push("");
    for (const s of failed) {
      lines.push(`- **${s.id}**: ${s.errorMessage ?? "validator errors"}`);
    }
  }
  writeFileSync(join(runDir, "_summary.md"), lines.join("\n"));
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

  // Run sequentially. Each clean-room internally parallelizes via the
  // AI queue (writers + validators); running multiple in parallel
  // here would just stampede the rate limit.
  const stats: SkillStats[] = [];
  for (const skill of skills) {
    const s = await runOne(skill, runDir);
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
