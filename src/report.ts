/**
 * Report rendering: ASCII table for `scan`, per-category detail for
 * `explain`, and baseline comparison for `diff`. All output is
 * file paths + counts + scores - never file contents.
 */
import type { ScanResult, CategoryEvidence } from "./scan.js";
import { alternativesFor, ALTERNATIVES_VERIFIED } from "./vendors.js";

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

export function renderTable(result: ScanResult): string {
  const lines: string[] = [];
  lines.push(`vendormap scan: ${result.dir}`);
  lines.push("");
  lines.push(
    `${pad("CATEGORY", 12)} ${pad("VENDOR", 16)} ${pad("REFS", 5)} ${pad("SHARE", 6)} ${pad("SCORE", 6)} ${pad("VERDICT", 13)} TOP FILES`,
  );
  lines.push("-".repeat(100));
  for (const c of result.categories) {
    const vendor = c.dominant ?? "-";
    const refs = String(c.totalRefs);
    const share = c.share === null ? "-" : `${Math.round(c.share * 100)}%`;
    const score = c.score === null ? "-" : String(c.score);
    const topFiles =
      c.vendors.length > 0
        ? c.vendors[0].files
            .slice(0, 2)
            .map((f) => f.file)
            .join(", ")
        : "-";
    lines.push(
      `${pad(c.category, 12)} ${pad(vendor, 16)} ${pad(refs, 5)} ${pad(share, 6)} ${pad(score, 6)} ${pad(c.verdict, 13)} ${topFiles}`,
    );
  }
  lines.push("");
  lines.push(`Overall concentration score: ${result.overall.score} (${result.overall.verdict})`);
  lines.push("Scores are concentration HEURISTICS (share^2 x 100), not risk measurements.");
  lines.push("");
  lines.push(`Coverage: found ${result.coverage.found.join(", ") || "none"}.`);
  if (result.coverage.absent.length > 0) {
    lines.push(`Coverage note: no ${result.coverage.absent.join(", ")} found in this directory - those layers are NOT-DETECTED, not scored 0.`);
  }
  return lines.join("\n");
}

export function renderExplain(result: ScanResult, category: string): string {
  const c: CategoryEvidence | undefined = result.categories.find((x) => x.category === category);
  if (!c) return `Unknown category: ${category}. Known: ${result.categories.map((x) => x.category).join(", ")}`;
  const lines: string[] = [];
  lines.push(`vendormap explain: ${category} (${result.dir})`);
  lines.push("");
  lines.push(`Verdict: ${c.verdict}${c.score !== null ? `, score ${c.score}` : ""}, ${c.totalRefs} refs total.`);
  if (c.totalRefs === 0) {
    lines.push("No references found: this layer is absent or unreadable in the scanned files.");
    lines.push("Runtime-only vendors, contracts and spend are invisible to a static scan.");
    return lines.join("\n");
  }
  if (c.verdict === "THIN") {
    lines.push("THIN: only 1 reference - not enough evidence for a verdict.");
  }
  lines.push("");
  for (const v of c.vendors) {
    lines.push(`${v.vendor}: ${v.refs} ref(s)${v.raw ? ` (raw: ${v.raw.join(", ")})` : ""}`);
    for (const f of v.files) {
      lines.push(`  ${f.file} (lines ${f.lines.join(", ")})`);
    }
  }
  lines.push("");
  if (c.dominant) {
    const alts = alternativesFor(category, c.dominant);
    if (alts.length > 0) {
      lines.push(`Second-source options for ${c.dominant} (verified ${ALTERNATIVES_VERIFIED}; re-verify before acting):`);
      for (const a of alts) lines.push(`  - ${a}`);
      lines.push("Alternatives are NOT drop-in replacements and switching costs are real.");
    }
  }
  return lines.join("\n");
}

export interface DiffEntry {
  category: string;
  beforeScore: number | null;
  afterScore: number | null;
  beforeVerdict: string;
  afterVerdict: string;
  added: string[];
  removed: string[];
  worse: boolean;
}

export function diffResults(before: ScanResult, after: ScanResult, threshold: number): DiffEntry[] {
  const out: DiffEntry[] = [];
  for (const a of after.categories) {
    const b = before.categories.find((x) => x.category === a.category);
    const beforeVendors = new Set((b?.vendors || []).map((v) => v.vendor));
    const afterVendors = new Set(a.vendors.map((v) => v.vendor));
    const added = [...afterVendors].filter((v) => !beforeVendors.has(v));
    const removed = [...beforeVendors].filter((v) => !afterVendors.has(v));
    const beforeScore = b?.score ?? null;
    const afterScore = a.score ?? null;
    let worse = false;
    if (a.verdict === "SINGLE-POINT" && b?.verdict !== "SINGLE-POINT") worse = true;
    if (
      beforeScore !== null &&
      afterScore !== null &&
      afterScore > beforeScore &&
      afterScore >= threshold
    ) {
      worse = true;
    }
    out.push({
      category: a.category,
      beforeScore,
      afterScore,
      beforeVerdict: b?.verdict ?? "NOT-DETECTED",
      afterVerdict: a.verdict,
      added: added.sort(),
      removed: removed.sort(),
      worse,
    });
  }
  return out;
}

export function renderDiff(entries: DiffEntry[], beforeDir: string, afterDir: string): string {
  const lines: string[] = [];
  lines.push(`vendormap diff: baseline ${beforeDir} vs ${afterDir}`);
  lines.push("");
  lines.push(`${pad("CATEGORY", 12)} ${pad("BEFORE", 16)} ${pad("AFTER", 16)} ${pad("DELTA", 7)} CHANGES`);
  lines.push("-".repeat(100));
  for (const e of entries) {
    const before = e.beforeScore === null ? e.beforeVerdict : `${e.beforeVerdict} ${e.beforeScore}`;
    const after = e.afterScore === null ? e.afterVerdict : `${e.afterVerdict} ${e.afterScore}`;
    const delta =
      e.beforeScore !== null && e.afterScore !== null
        ? (e.afterScore - e.beforeScore >= 0 ? "+" : "") + String(e.afterScore - e.beforeScore)
        : "-";
    const changes: string[] = [];
    for (const v of e.added) changes.push(`+${v}`);
    for (const v of e.removed) changes.push(`-${v}`);
    if (e.worse) changes.push("WORSE");
    lines.push(
      `${pad(e.category, 12)} ${pad(before, 16)} ${pad(after, 16)} ${pad(delta, 7)} ${changes.join(" ") || "-"}`,
    );
  }
  return lines.join("\n");
}
