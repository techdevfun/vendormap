#!/usr/bin/env node
/**
 * vendormap 0.1.0 - map your vendors from your own repo.
 *
 * One command that shows which single vendor can take each layer of
 * your stack down. Local, zero-dependency, offline. It never calls an
 * API, never sends anything anywhere, and never prints file contents
 * or secret values - paths, line numbers and counts only.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { scanDir, dirExists } from "./scan.js";
import type { ScanResult } from "./scan.js";
import { loadConfig } from "./config.js";
import { exitForVerdict } from "./scoring.js";
import { renderTable, renderExplain, diffResults, renderDiff } from "./report.js";
import { runInit, INIT_README } from "./init.js";
import { CATEGORY_NAMES } from "./vendors.js";

export const VERSION = "0.1.0";

const HELP = `vendormap ${VERSION} - map your vendors from your own repo.

Usage:
  vendormap init [--dir <dir>]                          scaffold vendormap.json
  vendormap scan <dir> [--config <file>] [--format table|json] [--include-unknown]
  vendormap check <dir> [--config <file>] [--max-score N] [--fail-on single-point|concentrated]
  vendormap explain <dir> --category <name>
  vendormap diff --baseline <file> <dir>

Categories: ${CATEGORY_NAMES.join(", ")}

scan reports and always exits 0. check is the CI gate: exit 0 DIVERSIFIED,
1 CONCENTRATED, 2 SINGLE-POINT (or any category score over --max-score).
Scores are concentration HEURISTICS (share^2 x 100), not risk measurements.
`;

function fail(msg: string): never {
  console.error(`vendormap: ${msg}`);
  process.exit(2);
}

function parseFlags(args: string[]): Record<string, string | boolean> {
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    if (key === "include-unknown") {
      flags[key] = true;
      continue;
    }
    const next = args[i + 1];
    if (next === undefined || next.startsWith("--")) fail(`flag --${key} needs a value`);
    flags[key] = next;
    i++;
  }
  return flags;
}

function positional(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      if (a !== "--include-unknown") i++; // skip the flag's value
      continue;
    }
    out.push(a);
  }
  return out;
}

function loadBaseline(path: string): ScanResult {
  if (!existsSync(path)) fail(`baseline file not found: ${path}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    fail(`baseline is not valid JSON: ${path}`);
  }
  const b = parsed as ScanResult;
  if (b.tool !== "vendormap" || !Array.isArray(b.categories)) {
    fail(`baseline is not a vendormap scan JSON: ${path}`);
  }
  return b;
}

function main(): void {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  if (!cmd || cmd === "--help" || cmd === "-h") {
    console.log(HELP);
    return;
  }
  if (cmd === "--version" || cmd === "-V") {
    console.log(`vendormap ${VERSION}`);
    return;
  }

  if (cmd === "init") {
    const flags = parseFlags(argv.slice(1));
    const dir = resolve(typeof flags["dir"] === "string" ? flags["dir"] : ".");
    const res = runInit(dir);
    if (res.alreadyExisted) {
      console.log(`vendormap.json already exists in ${dir}; refusing to overwrite.`);
      return;
    }
    console.log(`Created vendormap.json in ${dir}.`);
    console.log("");
    console.log("Next steps:");
    console.log("  vendormap scan .            map this repo's vendors");
    console.log("  vendormap check .           CI gate (exit 0/1/2)");
    console.log("  vendormap explain . --category gpu");
    console.log("");
    console.log(INIT_README);
    return;
  }

  if (cmd === "scan" || cmd === "check" || cmd === "explain") {
    const rest = argv.slice(1);
    const flags = parseFlags(rest);
    const pos = positional(rest);
    const dirArg = pos[0];
    if (!dirArg) fail(`usage: vendormap ${cmd} <dir>`);
    const dir = resolve(dirArg);
    if (!dirExists(dir)) fail(`directory not found: ${dirArg}`);
    const config = loadConfig(typeof flags["config"] === "string" ? flags["config"] : undefined, dir);
    const result = scanDir(dir, config);

    if (cmd === "scan") {
      const format = typeof flags["format"] === "string" ? flags["format"] : "table";
      if (format !== "table" && format !== "json") fail("--format must be table or json");
      if (format === "json") {
        const out = { ...result };
        if (!flags["include-unknown"]) {
          // Unknown vendors stay in the evidence either way; the flag
          // only controls whether the table lists them explicitly.
        }
        console.log(JSON.stringify(out, null, 2));
      } else {
        console.log(renderTable(result));
        if (flags["include-unknown"]) {
          const unknowns = result.categories.flatMap((c) =>
            c.vendors.filter((v) => v.vendor === "unknown").map((v) => `${c.category}: ${v.raw?.join(", ") ?? "unknown"}`),
          );
          if (unknowns.length > 0) {
            console.log("");
            console.log(`Unknown vendors (raw references, never auto-classified): ${unknowns.join("; ")}`);
          }
        }
      }
      return;
    }

    if (cmd === "check") {
      const maxScore = typeof flags["max-score"] === "string" ? Number(flags["max-score"]) : undefined;
      if (maxScore !== undefined && (!Number.isFinite(maxScore) || maxScore < 0 || maxScore > 100)) {
        fail("--max-score must be 0-100");
      }
      const failOn = typeof flags["fail-on"] === "string" ? flags["fail-on"] : undefined;
      if (failOn !== undefined && failOn !== "single-point" && failOn !== "concentrated") {
        fail("--fail-on must be single-point or concentrated");
      }
      let verdict = result.overall.verdict as "DIVERSIFIED" | "CONCENTRATED" | "SINGLE-POINT";
      let exit = exitForVerdict(verdict);
      const overMax = result.categories.filter((c) => c.score !== null && maxScore !== undefined && c.score > maxScore);
      if (overMax.length > 0 && verdict === "DIVERSIFIED") {
        verdict = "CONCENTRATED";
        exit = 1;
      }
      if (failOn === "single-point" && verdict === "CONCENTRATED") {
        verdict = "DIVERSIFIED";
        exit = 0;
      }
      if (failOn === "concentrated" && verdict === "SINGLE-POINT") {
        // single-point is worse than concentrated: still fails.
      }
      console.log(renderTable(result));
      console.log("");
      const failing = result.categories.filter((c) => c.verdict === "SINGLE-POINT" || c.verdict === "CONCENTRATED");
      if (failing.length > 0) {
        console.log("Failing categories (files that prove them):");
        for (const c of failing) {
          const files = [...new Set(c.vendors.flatMap((v) => v.files.map((f) => f.file)))];
          console.log(`  ${c.category}: ${c.verdict}${c.score !== null ? ` score ${c.score}` : ""} - ${files.join(", ")}`);
        }
      }
      if (overMax.length > 0) {
        console.log(`Over --max-score ${maxScore}: ${overMax.map((c) => `${c.category} ${c.score}`).join(", ")}`);
      }
      console.log(`check: ${verdict} (exit ${exit})`);
      process.exit(exit);
    }

    // explain
    const category = typeof flags["category"] === "string" ? flags["category"] : undefined;
    if (!category) fail("usage: vendormap explain <dir> --category <name>");
    if (!CATEGORY_NAMES.includes(category)) {
      fail(`unknown category: ${category}. Known: ${CATEGORY_NAMES.join(", ")}`);
    }
    console.log(renderExplain(result, category));
    return;
  }

  if (cmd === "diff") {
    const rest = argv.slice(1);
    const flags = parseFlags(rest);
    const baselinePath = typeof flags["baseline"] === "string" ? flags["baseline"] : undefined;
    if (!baselinePath) fail("usage: vendormap diff --baseline <file> <dir>");
    const pos = positional(rest);
    const dirArg = pos[0];
    if (!dirArg) fail("usage: vendormap diff --baseline <file> <dir>");
    const dir = resolve(dirArg);
    if (!dirExists(dir)) fail(`directory not found: ${dirArg}`);
    const baseline = loadBaseline(baselinePath);
    const config = loadConfig(undefined, dir);
    const current = scanDir(dir, config);
    const entries = diffResults(baseline, current, config.concentratedThreshold);
    console.log(renderDiff(entries, baseline.dir, current.dir));
    const worse = entries.filter((e) => e.worse);
    if (worse.length > 0) {
      console.log("");
      console.log(`Worse past threshold: ${worse.map((e) => e.category).join(", ")}`);
      process.exit(1);
    }
    console.log("");
    console.log("diff: no category got worse past threshold (exit 0)");
    return;
  }

  console.error(HELP);
  fail(`unknown command: ${cmd}`);
}

main();
