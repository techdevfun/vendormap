/**
 * Unit tests: scoring math, category states, env-name-only handling,
 * allowlist, threshold overrides, unknown vendors. No network.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scoreCategory } from "../dist/scoring.js";
import { DEFAULT_CONFIG } from "../dist/config.js";
import { scanDir } from "../dist/scan.js";

const cfg = { ...DEFAULT_CONFIG, thresholds: {}, weights: {}, allowlist: [] };

function counts(obj) {
  return new Map(Object.entries(obj));
}

test("score: single vendor, 2 refs -> SINGLE-POINT 100", () => {
  const s = scoreCategory("gpu", counts({ nvidia: 2 }), cfg);
  assert.equal(s.verdict, "SINGLE-POINT");
  assert.equal(s.score, 100);
  assert.equal(s.share, 1);
});

test("score: 2:1 split -> share 2/3, score 44, DIVERSIFIED", () => {
  const s = scoreCategory("registry", counts({ "docker-hub": 2, ghcr: 1 }), cfg);
  assert.equal(s.score, 44);
  assert.equal(s.verdict, "DIVERSIFIED");
});

test("score: 3:1 split -> score 56, CONCENTRATED at threshold 50", () => {
  const s = scoreCategory("model", counts({ openai: 3, anthropic: 1 }), cfg);
  assert.equal(s.score, 56);
  assert.equal(s.verdict, "CONCENTRATED");
});

test("score: 1:1 split -> score 25, DIVERSIFIED", () => {
  const s = scoreCategory("cloud", counts({ aws: 2, gcp: 2 }), cfg);
  assert.equal(s.score, 25);
  assert.equal(s.verdict, "DIVERSIFIED");
});

test("score: 1 ref total -> THIN, no score", () => {
  const s = scoreCategory("gpu", counts({ nvidia: 1 }), cfg);
  assert.equal(s.verdict, "THIN");
  assert.equal(s.score, null);
});

test("score: 0 refs -> NOT-DETECTED, no score", () => {
  const s = scoreCategory("gpu", counts({}), cfg);
  assert.equal(s.verdict, "NOT-DETECTED");
  assert.equal(s.score, null);
  assert.equal(s.totalRefs, 0);
});

test("score: per-category threshold override is honored", () => {
  const over = { ...cfg, thresholds: { gpu: 40 } };
  const s = scoreCategory("gpu", counts({ nvidia: 2, amd: 1 }), over);
  assert.equal(s.score, 44);
  assert.equal(s.verdict, "CONCENTRATED"); // 44 >= 40, but < 50
  const s2 = scoreCategory("gpu", counts({ nvidia: 2, amd: 1 }), cfg);
  assert.equal(s2.verdict, "DIVERSIFIED");
});

test("scan: allowlisted vendor is excluded from scoring but still listed", () => {
  const dir = mkdtempSync(join(tmpdir(), "vm-allow-"));
  writeFileSync(join(dir, "Dockerfile"), "FROM nvidia/cuda:12.3.0-runtime\nFROM nvidia/cuda:12.3.0-devel\n");
  const allow = { ...cfg, allowlist: ["nvidia"] };
  const r = scanDir(dir, allow);
  const gpu = r.categories.find((c) => c.category === "gpu");
  assert.equal(gpu.totalRefs, 0);
  assert.equal(gpu.verdict, "NOT-DETECTED");
  // ...but the evidence is still listed, not hidden.
  assert.equal(gpu.vendors[0].vendor, "nvidia");
  assert.equal(gpu.vendors[0].refs, 2);
});

test("scan: env template contributes key NAMES only, never values", () => {
  const dir = mkdtempSync(join(tmpdir(), "vm-env-"));
  // The VALUE mentions openai; the key does not. openai must NOT appear.
  // The key STRIPE_SECRET_KEY must count stripe once.
  writeFileSync(
    join(dir, ".env.example"),
    "FAKE_FLAG=sk-openai-not-a-real-key\nSTRIPE_SECRET_KEY=YOUR_KEY_HERE\n",
  );
  const r = scanDir(dir, cfg);
  const model = r.categories.find((c) => c.category === "model");
  assert.equal(model.totalRefs, 0);
  assert.equal(model.verdict, "NOT-DETECTED");
  const pay = r.categories.find((c) => c.category === "payments");
  assert.equal(pay.totalRefs, 1);
  assert.equal(pay.verdict, "THIN");
  assert.equal(pay.vendors[0].vendor, "stripe");
});

test("scan: real .env files are skipped entirely", () => {
  const dir = mkdtempSync(join(tmpdir(), "vm-realenv-"));
  writeFileSync(join(dir, ".env"), "OPENAI_API_KEY=sk-real-value-here\nAWS_ACCESS_KEY_ID=AKIAEXAMPLE\n");
  const r = scanDir(dir, cfg);
  for (const c of r.categories) assert.equal(c.totalRefs, 0, c.category);
});

test("scan: secret/pem/key files are skipped entirely", () => {
  const dir = mkdtempSync(join(tmpdir(), "vm-secret-"));
  writeFileSync(join(dir, "prod-secret.txt"), "openai stripe aws");
  writeFileSync(join(dir, "server.pem"), "openai stripe aws");
  writeFileSync(join(dir, "id.key"), "openai stripe aws");
  const r = scanDir(dir, cfg);
  for (const c of r.categories) assert.equal(c.totalRefs, 0, c.category);
});

test("scan: unknown image registry is reported as unknown with raw host", () => {
  const dir = mkdtempSync(join(tmpdir(), "vm-unknown-"));
  writeFileSync(join(dir, "Dockerfile"), "FROM registry.example-corp.internal:5000/app:1.0\n");
  const r = scanDir(dir, cfg);
  const reg = r.categories.find((c) => c.category === "registry");
  assert.equal(reg.totalRefs, 1);
  assert.equal(reg.vendors[0].vendor, "unknown");
  assert.deepEqual(reg.vendors[0].raw, ["registry.example-corp.internal:5000"]);
});

test("scan: unknown terraform provider is reported as unknown with raw name", () => {
  const dir = mkdtempSync(join(tmpdir(), "vm-tf-unknown-"));
  mkdirSync(join(dir, "terraform"));
  writeFileSync(join(dir, "terraform", "main.tf"), 'provider "acmecloud" {}\n');
  const r = scanDir(dir, cfg);
  const cloud = r.categories.find((c) => c.category === "cloud");
  assert.equal(cloud.totalRefs, 1);
  assert.equal(cloud.vendors[0].vendor, "unknown");
  assert.deepEqual(cloud.vendors[0].raw, ["acmecloud"]);
});

test("scan: output contains paths + counts only, never file contents", () => {
  const dir = mkdtempSync(join(tmpdir(), "vm-nocontent-"));
  writeFileSync(join(dir, "Dockerfile"), "FROM ghcr.io/acme/web:latest\n# SECRET MARKER hullabaloo-xyz-123\n");
  const r = scanDir(dir, cfg);
  const json = JSON.stringify(r);
  assert.ok(!json.includes("hullabaloo-xyz-123"), "file content leaked into output");
  assert.ok(!json.includes("SECRET MARKER"), "file content leaked into output");
  assert.ok(json.includes("Dockerfile"), "evidence path missing");
});

test("scan: empty dir -> all NOT-DETECTED, overall 0 DIVERSIFIED", () => {
  const dir = mkdtempSync(join(tmpdir(), "vm-empty-"));
  const r = scanDir(dir, cfg);
  assert.equal(r.overall.score, 0);
  assert.equal(r.overall.verdict, "DIVERSIFIED");
  for (const c of r.categories) assert.equal(c.verdict, "NOT-DETECTED");
});
