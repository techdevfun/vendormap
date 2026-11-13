/**
 * E2E tests: run the real CLI (node dist/cli.js) over the two fixtures.
 * Expected numbers are the fixtures' own, computed by the tool itself
 * and locked in here after a manual review of the scan output.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(ROOT, "dist", "cli.js");
const ACME = join(ROOT, "examples", "acme-shop");
const DIVERSE = join(ROOT, "examples", "diversified-shop");

function run(args, cwd = ROOT) {
  return spawnSync("node", [CLI, ...args], { cwd, encoding: "utf8" });
}

function scanJson(dir) {
  const r = run(["scan", dir, "--format", "json"]);
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

function cat(result, name) {
  const c = result.categories.find((x) => x.category === name);
  assert.ok(c, `missing category ${name}`);
  return c;
}

test("e2e: acme-shop scans as all SINGLE-POINT, overall 100", () => {
  const r = scanJson(ACME);
  assert.equal(r.overall.score, 100);
  assert.equal(r.overall.verdict, "SINGLE-POINT");
  assert.equal(cat(r, "cloud").totalRefs, 8);
  assert.equal(cat(r, "gpu").totalRefs, 3);
  assert.equal(cat(r, "model").totalRefs, 4);
  assert.equal(cat(r, "registry").totalRefs, 3);
  assert.equal(cat(r, "identity").totalRefs, 4);
  assert.equal(cat(r, "dns-cdn").totalRefs, 3);
  assert.equal(cat(r, "payments").totalRefs, 4);
  assert.equal(cat(r, "ci").totalRefs, 4);
  assert.equal(cat(r, "data").totalRefs, 2);
  for (const c of r.categories) assert.equal(c.verdict, "SINGLE-POINT", c.category);
  assert.deepEqual(r.coverage.found, [
    "terraform",
    "kubernetes",
    "dockerfile",
    "package-manifest",
    "lockfile",
    "workflows",
    "code-imports",
    "env-template",
  ]);
});

test("e2e: diversified-shop scans as DIVERSIFIED, overall 44", () => {
  const r = scanJson(DIVERSE);
  assert.equal(r.overall.score, 44);
  assert.equal(r.overall.verdict, "DIVERSIFIED");
  assert.equal(cat(r, "cloud").score, 25);
  assert.equal(cat(r, "gpu").score, 25);
  assert.equal(cat(r, "model").score, 25);
  assert.equal(cat(r, "registry").score, 44);
  assert.equal(cat(r, "identity").score, 25);
  assert.equal(cat(r, "dns-cdn").score, 25);
  assert.equal(cat(r, "payments").score, 44);
  assert.equal(cat(r, "ci").score, 44);
  assert.equal(cat(r, "data").score, 25);
  for (const c of r.categories) assert.equal(c.verdict, "DIVERSIFIED", c.category);
});

test("e2e: check exits 2 on acme-shop, 0 on diversified-shop", () => {
  assert.equal(run(["check", ACME]).status, 2);
  assert.equal(run(["check", DIVERSE]).status, 0);
});

test("e2e: check --max-score 30 fails diversified-shop (44 > 30)", () => {
  const r = run(["check", DIVERSE, "--max-score", "30"]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Over --max-score 30/);
});

test("e2e: check --fail-on single-point passes a merely CONCENTRATED stack", () => {
  // diversified-shop with a max-score breach is CONCENTRATED, not
  // SINGLE-POINT, so --fail-on single-point must still exit 0.
  const r = run(["check", DIVERSE, "--max-score", "30", "--fail-on", "single-point"]);
  assert.equal(r.status, 0);
});

test("e2e: explain gpu on acme-shop names files, lines and alternatives", () => {
  const r = run(["explain", ACME, "--category", "gpu"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /SINGLE-POINT, score 100, 3 refs total/);
  assert.match(r.stdout, /k8s\/deployment\.yaml \(lines 16, 22\)/);
  assert.match(r.stdout, /src\/app\.py \(lines 4\)/);
  assert.match(r.stdout, /AMD ROCm/);
  assert.match(r.stdout, /NOT drop-in replacements/);
});

test("e2e: explain rejects an unknown category", () => {
  const r = run(["explain", ACME, "--category", "nope"]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /unknown category/);
});

test("e2e: init scaffolds vendormap.json and refuses to overwrite", () => {
  const dir = mkdtempSync(join(tmpdir(), "vm-init-"));
  const first = run(["init", "--dir", dir]);
  assert.equal(first.status, 0, first.stderr);
  assert.ok(existsSync(join(dir, "vendormap.json")));
  const cfg = JSON.parse(readFileSync(join(dir, "vendormap.json"), "utf8"));
  assert.equal(cfg.concentratedThreshold, 50);
  assert.equal(cfg.version, 1);
  const second = run(["init", "--dir", dir]);
  assert.equal(second.status, 0);
  assert.match(second.stdout, /refusing to overwrite/);
});

test("e2e: diff identical scans exits 0; diff vs acme-shop exits 1", () => {
  const dir = mkdtempSync(join(tmpdir(), "vm-diff-"));
  const baselinePath = join(dir, "baseline.json");
  writeFileSync(baselinePath, JSON.stringify(scanJson(DIVERSE)));
  const same = run(["diff", "--baseline", baselinePath, DIVERSE]);
  assert.equal(same.status, 0, same.stdout);
  assert.match(same.stdout, /no category got worse/);
  const worse = run(["diff", "--baseline", baselinePath, ACME]);
  assert.equal(worse.status, 1);
  assert.match(worse.stdout, /Worse past threshold/);
  assert.match(worse.stdout, /-gcp/); // acme-shop drops the second vendor
  assert.match(worse.stdout, /SINGLE-POINT 100/);
});

test("e2e: diff rejects a non-vendormap baseline", () => {
  const dir = mkdtempSync(join(tmpdir(), "vm-diff-bad-"));
  const bad = join(dir, "bad.json");
  writeFileSync(bad, JSON.stringify({ hello: "world" }));
  const r = run(["diff", "--baseline", bad, DIVERSE]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /not a vendormap scan JSON/);
});

test("e2e: scan --format json carries evidence paths + line numbers", () => {
  const r = scanJson(ACME);
  const gpu = cat(r, "gpu");
  const nvidia = gpu.vendors.find((v) => v.vendor === "nvidia");
  assert.equal(nvidia.refs, 3);
  const files = nvidia.files.map((f) => f.file);
  assert.ok(files.includes("k8s/deployment.yaml"));
  assert.ok(files.includes("src/app.py"));
  const k8s = nvidia.files.find((f) => f.file === "k8s/deployment.yaml");
  assert.deepEqual(k8s.lines, [16, 22]);
});

test("e2e: table output labels the score a heuristic and notes coverage", () => {
  const r = run(["scan", ACME]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /concentration HEURISTICS/);
  assert.match(r.stdout, /Coverage: found terraform/);
});
