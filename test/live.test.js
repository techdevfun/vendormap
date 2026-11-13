/**
 * Live smoke: re-check the two name-availability facts the build relies
 * on (npm `vendormap` 404 + techdevfun/vendormap 404). Soft-skip when
 * offline - a network failure is not a product failure.
 */
import test from "node:test";
import assert from "node:assert/strict";

async function status(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "manual" });
    return res.status;
  } finally {
    clearTimeout(t);
  }
}

test("live: npm vendormap is still 404 (name free)", async (t) => {
  let code;
  try {
    code = await status("https://registry.npmjs.org/vendormap");
  } catch {
    t.skip("offline - cannot reach npm registry");
    return;
  }
  assert.equal(code, 404);
});

test("live: techdevfun/vendormap is still 404 (name free)", async (t) => {
  let code;
  try {
    code = await status("https://api.github.com/repos/techdevfun/vendormap");
  } catch {
    t.skip("offline - cannot reach api.github.com");
    return;
  }
  // 403/429 unauthenticated means rate-limited, not "exists": inconclusive.
  if (code === 403 || code === 429) {
    t.skip(`api.github.com rate-limited (${code}) - cannot confirm, re-check in CI`);
    return;
  }
  assert.equal(code, 404);
});
