/**
 * Bench report. Reads two run directories under `.skillet-bench/`
 * and emits a markdown comparison highlighting deltas, regressions,
 * and improvements.
 *
 * Usage:
 *
 *   tsx bench/report.ts <baseline-label> <candidate-label> [--out <path>]
 *
 * Examples:
 *
 *   tsx bench/report.ts before-name-fix after-name-fix
 *   tsx bench/report.ts 2026-05-04T... 2026-05-05T... --out report.md
 *
 * Without --out, writes to stdout.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
  agentRuns: Array<{ agent: string; pass: number; toolCalls: number }>;
  diagnostics: {
    skill: { ok: boolean; findings: number; errors: number };
    evals: { ok: boolean; findings: number; errors: number };
  };
  checks: {
    namePreserved: boolean | null;
    behaviorsCoveredInSkillMd: number;
    behaviorsExpectedInSkillMd: number;
    evalCoverageRatio: number;
  };
}

interface RunMeta {
  label: string;
  timestamp: string;
  model: string;
  skills: string[];
}

const HERE = dirname(fileURLToPath(import.meta.url));
const BENCH_DIR = resolve(HERE, "..", ".skillet-bench");

const parseArgs = (
  argv: string[],
): { baseline: string; candidate: string; out?: string } => {
  let baseline: string | undefined;
  let candidate: string | undefined;
  let out: string | undefined;
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out" && argv[i + 1] != null) {
      out = argv[i + 1];
      i++;
    } else if (a != null && !a.startsWith("--")) {
      positional.push(a);
    }
  }
  baseline = positional[0];
  candidate = positional[1];
  if (baseline == null || candidate == null) {
    console.error("Usage: tsx bench/report.ts <baseline-label> <candidate-label> [--out <path>]");
    process.exit(2);
  }
  const result: { baseline: string; candidate: string; out?: string } = { baseline, candidate };
  if (out != null) result.out = out;
  return result;
};

const loadRun = (label: string): { meta: RunMeta; stats: Map<string, SkillStats> } => {
  const dir = join(BENCH_DIR, label);
  if (!existsSync(dir)) {
    console.error(`bench: no run found at ${dir}`);
    process.exit(2);
  }
  const metaPath = join(dir, "_meta.json");
  if (!existsSync(metaPath)) {
    console.error(`bench: ${dir} missing _meta.json — incomplete run?`);
    process.exit(2);
  }
  const meta = JSON.parse(readFileSync(metaPath, "utf-8")) as RunMeta;
  const stats = new Map<string, SkillStats>();
  for (const id of meta.skills) {
    const statsPath = join(dir, id, "_stats.json");
    if (existsSync(statsPath)) {
      stats.set(id, JSON.parse(readFileSync(statsPath, "utf-8")) as SkillStats);
    }
  }
  return { meta, stats };
};

const fmtDelta = (a: number, b: number, opts: { lowerBetter?: boolean } = {}): string => {
  const delta = b - a;
  if (delta === 0) return "·";
  const sign = delta > 0 ? "+" : "";
  const better = opts.lowerBetter === true ? delta < 0 : delta > 0;
  const arrow = better ? "↑" : "↓";
  return `${sign}${delta} ${arrow}`;
};

const fmtBoolDelta = (a: boolean | null, b: boolean | null): string => {
  if (a === b) return a == null ? "?" : a ? "✓" : "✗";
  if (a === false && b === true) return "✗→✓ ↑";
  if (a === true && b === false) return "✓→✗ ↓";
  return `${a ?? "?"}→${b ?? "?"}`;
};

const compareSkill = (id: string, a: SkillStats | undefined, b: SkillStats | undefined): string[] => {
  const lines: string[] = [];
  lines.push(`### \`${id}\``);
  lines.push("");
  if (a == null && b == null) {
    lines.push("(no data in either run)");
    return lines;
  }
  if (a == null) {
    lines.push(`(new in candidate run — see \`_summary.md\` of candidate)`);
    return lines;
  }
  if (b == null) {
    lines.push(`(removed from candidate run)`);
    return lines;
  }
  lines.push("| metric | baseline | candidate | delta |");
  lines.push("|--------|---------:|----------:|------:|");
  lines.push(`| ok | ${a.ok ? "✓" : "✗"} | ${b.ok ? "✓" : "✗"} | ${fmtBoolDelta(a.ok, b.ok)} |`);
  lines.push(
    `| name preserved | ${a.checks.namePreserved == null ? "?" : a.checks.namePreserved ? "✓" : `✗(${a.spec.name})`} | ${b.checks.namePreserved == null ? "?" : b.checks.namePreserved ? "✓" : `✗(${b.spec.name})`} | ${fmtBoolDelta(a.checks.namePreserved, b.checks.namePreserved)} |`,
  );
  lines.push(`| spec class | ${a.spec.class} | ${b.spec.class} | ${a.spec.class === b.spec.class ? "·" : "changed"} |`);
  lines.push(`| behaviors | ${a.spec.behaviors} | ${b.spec.behaviors} | ${fmtDelta(a.spec.behaviors, b.spec.behaviors)} |`);
  lines.push(`| must_nots | ${a.spec.must_nots} | ${b.spec.must_nots} | ${fmtDelta(a.spec.must_nots, b.spec.must_nots)} |`);
  lines.push(`| references | ${a.spec.references} | ${b.spec.references} | ${fmtDelta(a.spec.references, b.spec.references)} |`);
  lines.push(`| SKILL.md lines | ${a.artifacts.skillMdLines ?? "—"} | ${b.artifacts.skillMdLines ?? "—"} | ${a.artifacts.skillMdLines != null && b.artifacts.skillMdLines != null ? fmtDelta(a.artifacts.skillMdLines, b.artifacts.skillMdLines, { lowerBetter: true }) : "—"} |`);
  lines.push(`| eval files | ${a.artifacts.evalFiles} | ${b.artifacts.evalFiles} | ${fmtDelta(a.artifacts.evalFiles, b.artifacts.evalFiles)} |`);
  lines.push(`| judges | ${a.artifacts.judges} | ${b.artifacts.judges} | ${fmtDelta(a.artifacts.judges, b.artifacts.judges)} |`);
  lines.push(`| fixtures | ${a.artifacts.fixtures} | ${b.artifacts.fixtures} | ${fmtDelta(a.artifacts.fixtures, b.artifacts.fixtures)} |`);
  lines.push(`| SOURCES.md | ${a.artifacts.sourcesPresent ? "✓" : "—"} | ${b.artifacts.sourcesPresent ? "✓" : "—"} | ${fmtBoolDelta(a.artifacts.sourcesPresent, b.artifacts.sourcesPresent)} |`);
  lines.push(`| skill-validator errors | ${a.diagnostics.skill.errors} (${a.diagnostics.skill.findings}) | ${b.diagnostics.skill.errors} (${b.diagnostics.skill.findings}) | ${fmtDelta(a.diagnostics.skill.errors, b.diagnostics.skill.errors, { lowerBetter: true })} |`);
  lines.push(`| evals-validator errors | ${a.diagnostics.evals.errors} (${a.diagnostics.evals.findings}) | ${b.diagnostics.evals.errors} (${b.diagnostics.evals.findings}) | ${fmtDelta(a.diagnostics.evals.errors, b.diagnostics.evals.errors, { lowerBetter: true })} |`);
  lines.push(`| eval coverage | ${(a.checks.evalCoverageRatio * 100).toFixed(0)}% | ${(b.checks.evalCoverageRatio * 100).toFixed(0)}% | ${fmtDelta(Math.round(a.checks.evalCoverageRatio * 100), Math.round(b.checks.evalCoverageRatio * 100))} pp |`);
  lines.push(`| wall-clock | ${(a.elapsedMs / 1000).toFixed(0)}s | ${(b.elapsedMs / 1000).toFixed(0)}s | ${fmtDelta(Math.round(a.elapsedMs / 1000), Math.round(b.elapsedMs / 1000), { lowerBetter: true })}s |`);
  lines.push("");
  if (a.errorMessage != null || b.errorMessage != null) {
    lines.push(`- baseline error: ${a.errorMessage ?? "—"}`);
    lines.push(`- candidate error: ${b.errorMessage ?? "—"}`);
    lines.push("");
  }
  return lines;
};

const renderHeadline = (
  ametastats: { meta: RunMeta; stats: Map<string, SkillStats> },
  bmetastats: { meta: RunMeta; stats: Map<string, SkillStats> },
): string[] => {
  const out: string[] = [];
  out.push(`# Bench comparison: \`${ametastats.meta.label}\` → \`${bmetastats.meta.label}\``);
  out.push("");
  out.push(`- Baseline: ${ametastats.meta.timestamp} (model \`${ametastats.meta.model}\`)`);
  out.push(`- Candidate: ${bmetastats.meta.timestamp} (model \`${bmetastats.meta.model}\`)`);
  out.push("");

  const allIds = new Set<string>([...ametastats.stats.keys(), ...bmetastats.stats.keys()]);
  let aOk = 0;
  let bOk = 0;
  let aNames = 0;
  let bNames = 0;
  let aLines = 0;
  let bLines = 0;
  let aFindings = 0;
  let bFindings = 0;
  for (const id of allIds) {
    const a = ametastats.stats.get(id);
    const b = bmetastats.stats.get(id);
    if (a?.ok === true) aOk++;
    if (b?.ok === true) bOk++;
    if (a?.checks.namePreserved === true) aNames++;
    if (b?.checks.namePreserved === true) bNames++;
    if (a?.artifacts.skillMdLines != null) aLines += a.artifacts.skillMdLines;
    if (b?.artifacts.skillMdLines != null) bLines += b.artifacts.skillMdLines;
    aFindings += (a?.diagnostics.skill.errors ?? 0) + (a?.diagnostics.evals.errors ?? 0);
    bFindings += (b?.diagnostics.skill.errors ?? 0) + (b?.diagnostics.evals.errors ?? 0);
  }

  out.push("## Headline");
  out.push("");
  out.push(`| | baseline | candidate | delta |`);
  out.push(`|---|---:|---:|---:|`);
  out.push(`| skills succeeded | ${aOk}/${allIds.size} | ${bOk}/${allIds.size} | ${fmtDelta(aOk, bOk)} |`);
  out.push(`| names preserved | ${aNames}/${allIds.size} | ${bNames}/${allIds.size} | ${fmtDelta(aNames, bNames)} |`);
  out.push(`| total SKILL.md lines | ${aLines} | ${bLines} | ${fmtDelta(aLines, bLines, { lowerBetter: true })} |`);
  out.push(`| total validator errors | ${aFindings} | ${bFindings} | ${fmtDelta(aFindings, bFindings, { lowerBetter: true })} |`);
  out.push("");
  return out;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const baseline = loadRun(args.baseline);
  const candidate = loadRun(args.candidate);

  const lines: string[] = [];
  lines.push(...renderHeadline(baseline, candidate));

  lines.push("## Per-skill comparison");
  lines.push("");
  const allIds = [...new Set([...baseline.stats.keys(), ...candidate.stats.keys()])].sort();
  for (const id of allIds) {
    lines.push(...compareSkill(id, baseline.stats.get(id), candidate.stats.get(id)));
  }

  const text = lines.join("\n");
  if (args.out != null) {
    writeFileSync(args.out, text);
    console.error(`bench: wrote report → ${args.out}`);
  } else {
    process.stdout.write(text);
  }
}

main().catch((e) => {
  console.error("bench/report: fatal", e);
  process.exit(1);
});
