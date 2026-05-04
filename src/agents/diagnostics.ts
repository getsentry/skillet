/**
 * Parse a validator agent's terminal text into a `Diagnostics`
 * object. Validators are instructed to emit a single fenced JSON
 * block as their final output; we extract the LAST such block
 * (so the agent can think out loud first), parse it, and
 * structurally validate against the schema.
 */

import type { Diagnostics, Finding, FindingSeverity } from "./types.js";

const FENCED_BLOCK = /```(?:json)?\s*\n([\s\S]*?)\n```/g;

const VALID_SEVERITIES: ReadonlySet<string> = new Set<FindingSeverity>([
  "error",
  "warning",
  "info",
]);

const isRecord = (v: unknown): v is Record<string, unknown> => {
  return v != null && typeof v === "object" && !Array.isArray(v);
};

const isFindingSeverity = (v: unknown): v is FindingSeverity => {
  return typeof v === "string" && VALID_SEVERITIES.has(v);
};

/** Extract the LAST fenced JSON block from a free-form text. */
const extractLastJsonBlock = (text: string): string | null => {
  const matches = [...text.matchAll(FENCED_BLOCK)];
  if (matches.length === 0) return null;
  return matches.at(-1)?.[1]?.trim() ?? null;
};

/** Parse and validate a single finding entry. */
const parseFinding = (raw: unknown, idx: number): Finding => {
  if (!isRecord(raw)) {
    throw new Error(`finding #${idx}: must be an object`);
  }
  const severity = raw.severity;
  if (!isFindingSeverity(severity)) {
    throw new Error(
      `finding #${idx}: 'severity' must be one of error|warning|info, got ${JSON.stringify(severity)}`,
    );
  }
  const subject = raw.subject;
  if (typeof subject !== "string" || subject === "") {
    throw new Error(`finding #${idx}: 'subject' must be a non-empty string`);
  }
  const kind = raw.kind;
  if (typeof kind !== "string" || kind === "") {
    throw new Error(`finding #${idx}: 'kind' must be a non-empty string`);
  }
  const message = raw.message;
  if (typeof message !== "string" || message === "") {
    throw new Error(`finding #${idx}: 'message' must be a non-empty string`);
  }
  const finding: Finding = {
    severity,
    subject,
    kind,
    message,
  };
  const suggestion = raw.suggestion;
  if (typeof suggestion === "string" && suggestion !== "") {
    finding.suggestion = suggestion;
  }
  return finding;
};

/**
 * Parse a validator's terminal text into a `Diagnostics`. Throws on
 * absent/malformed JSON so the orchestrator surfaces the offending
 * agent rather than silently treating it as `ok`.
 */
export const parseDiagnostics = (terminalText: string): Diagnostics => {
  const raw = extractLastJsonBlock(terminalText);
  if (raw == null) {
    throw new Error("validator did not emit a fenced JSON block in its terminal text");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`validator JSON parse failed: ${msg}`, { cause: err });
  }
  if (!isRecord(parsed)) {
    throw new Error("validator JSON: top-level value must be an object");
  }
  if (typeof parsed.ok !== "boolean") {
    throw new Error("validator JSON: 'ok' must be a boolean");
  }
  const rawFindings = parsed.findings;
  if (!Array.isArray(rawFindings)) {
    throw new Error("validator JSON: 'findings' must be an array");
  }
  const findings = rawFindings.map((f, i) => parseFinding(f, i));
  return { ok: parsed.ok, findings };
};

/**
 * Render a `Diagnostics` as a Markdown block suitable for
 * appending to a writer agent's `extraContext` on a re-pass.
 */
export const formatDiagnostics = (diag: Diagnostics, header: string): string => {
  const lines: string[] = [`## ${header}`, ""];
  if (diag.findings.length === 0) {
    lines.push("(no findings)");
    return lines.join("\n");
  }
  for (const f of diag.findings) {
    const sev = f.severity.toUpperCase();
    lines.push(`- **[${sev}] ${f.subject} — ${f.kind}**: ${f.message}`);
    if (f.suggestion != null) {
      lines.push(`  - Suggestion: ${f.suggestion}`);
    }
  }
  return lines.join("\n");
};
