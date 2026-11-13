/**
 * Bench: time `scan` over the two demo fixtures, 200 runs each.
 * Prints median + p95. Run 3 times and take the median of the medians
 * for the README number. Target: p95 < 5 s on the demo fixture set.
 */
import { scanDir } from "../dist/scan.js";
import { DEFAULT_CONFIG } from "../dist/config.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const dirs = [join(ROOT, "examples", "acme-shop"), join(ROOT, "examples", "diversified-shop")];

function quantile(sorted, q) {
  const i = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
  return sorted[i];
}

const samples = [];
for (let i = 0; i < 200; i++) {
  const t0 = performance.now();
  for (const d of dirs) scanDir(d, DEFAULT_CONFIG);
  samples.push(performance.now() - t0);
}
samples.sort((a, b) => a - b);
console.log(
  `scan over 2 demo fixtures (200 runs): median ${quantile(samples, 0.5).toFixed(2)} ms, p95 ${quantile(samples, 0.95).toFixed(2)} ms, max ${samples[samples.length - 1].toFixed(2)} ms`,
);
