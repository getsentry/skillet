import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolveModels } from "../agent/provider.js";
import { specFileName } from "../spec/index.js";
import { verify } from "../verify/index.js";
import type { VerifyReport } from "../verify/index.js";

export interface VerifyOptions {
  path?: string;
  json?: boolean;
  semantic?: boolean;
}

const parseVerifyArgs = (args: string[]): VerifyOptions => {
  const path = args.find((a) => !a.startsWith("--"));
  const json = args.includes("--json");
  const semantic = args.includes("--semantic");
  const opts: VerifyOptions = { json, semantic };
  if (path != null) opts.path = path;
  return opts;
};

export const verifyCommand = async (args: string[]): Promise<number> => {
  const opts = parseVerifyArgs(args);
  const skillRoot = resolve(opts.path ?? ".");
  const specPath = join(skillRoot, specFileName());

  if (!existsSync(specPath)) {
    if (opts.json === true) {
      console.log(
        JSON.stringify(
          { ok: false, error: "no spec.yaml — run `skillet create` or `skillet spec import`" },
          null,
          2,
        ),
      );
    } else {
      console.error(`Error: no ${specFileName()} at ${skillRoot}`);
      console.error("Run `skillet create <description>` or `skillet spec import` first.");
    }
    return 1;
  }

  // Semantic layer needs the judge model; resolve only when requested
  // so verify --json without --semantic still runs without LLM keys.
  const verifyOpts: { semantic?: boolean; judgeModel?: ReturnType<typeof resolveModels>["judge"] } =
    {};
  if (opts.semantic === true) {
    verifyOpts.semantic = true;
    verifyOpts.judgeModel = resolveModels().judge;
  }

  let report: VerifyReport;
  try {
    report = await verify(skillRoot, verifyOpts);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (opts.json === true) {
      console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
    } else {
      console.error(`Error: ${msg}`);
    }
    return 1;
  }

  if (opts.json === true) {
    console.log(JSON.stringify(report, null, 2));
    return report.ok ? 0 : 1;
  }

  printPretty(report);
  return report.ok ? 0 : 1;
};

const ICON_PASS = "\u001B[32m\u2713\u001B[0m";
const ICON_FAIL = "\u001B[31m\u2717\u001B[0m";

const printPretty = (report: VerifyReport): void => {
  // Layer 1
  if (!report.structural.ok) {
    console.log(`${ICON_FAIL} Structural (${report.structural.errors.length} error(s))`);
    for (const e of report.structural.errors) {
      console.log(`    ${e.path}`);
      console.log(`      ${e.message}`);
    }
    return;
  }
  console.log(`${ICON_PASS} Structural`);

  // Layer 2
  if (report.coverage == null) {
    console.log("  (no spec — coverage / results / semantic not evaluated)");
    return;
  }
  if (!report.coverage.ok) {
    console.log(`${ICON_FAIL} Coverage`);
    if (report.coverage.uncovered.length > 0) {
      console.log("    Uncovered behaviors:");
      for (const u of report.coverage.uncovered) {
        console.log(`      - ${u.kind}:${u.id} — ${u.statement}`);
      }
    }
    if (report.coverage.orphans.length > 0) {
      console.log("    Orphan eval cases (tests_behavior references unknown id):");
      for (const o of report.coverage.orphans) {
        console.log(`      - ${o.caseName} → ${o.testsBehavior}`);
      }
    }
    for (const issue of report.coverage.issues) {
      console.log(`    ${issue.path}: ${issue.message}`);
    }
    return;
  }
  console.log(`${ICON_PASS} Coverage (${report.coverage.covered.length} behaviors covered)`);

  // Layer 3
  if (report.results != null) {
    if (!report.results.ok) {
      console.log(`${ICON_FAIL} Results`);
      for (const v of report.results.behaviors) {
        if (v.status === "covered+passing") continue;
        console.log(`      - ${v.kind}:${v.id} → ${v.status}`);
      }
      return;
    }
    console.log(`${ICON_PASS} Results (per-behavior all passing)`);
  }

  // Layer 4
  if (report.semantic != null) {
    if (!report.semantic.ok) {
      console.log(`${ICON_FAIL} Semantic`);
      for (const v of report.semantic.behaviors) {
        if (v.verdict === "encoded") continue;
        console.log(`      - ${v.kind}:${v.id} → ${v.verdict}: ${v.reasoning}`);
      }
      return;
    }
    console.log(`${ICON_PASS} Semantic (every behavior encoded in SKILL.md)`);
  }
};
