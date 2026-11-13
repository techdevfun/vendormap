/**
 * Scoring: deterministic, published, overridable.
 *
 * Per category: share = dominant vendor refs / total refs;
 * score = round(100 * share^2) (Herfindahl-style, 0-100).
 * This score is a concentration HEURISTIC, not a measurement of risk.
 *   0 refs        -> NOT-DETECTED (absent or unreadable; never scored 0)
 *   1 ref total   -> THIN (not enough evidence, not a verdict)
 *   1 vendor, >=2 -> SINGLE-POINT regardless of score
 *   score >= threshold -> CONCENTRATED, else DIVERSIFIED
 * Overall score = worst category score. Overall verdict = worst
 * category verdict (SINGLE-POINT > CONCENTRATED > DIVERSIFIED).
 * THIN / NOT-DETECTED categories never drive the overall verdict.
 */
import type { VendorMapConfig } from "./config.js";
import { thresholdFor } from "./config.js";

export type CategoryVerdict = "DIVERSIFIED" | "CONCENTRATED" | "SINGLE-POINT" | "THIN" | "NOT-DETECTED";
export type OverallVerdict = "DIVERSIFIED" | "CONCENTRATED" | "SINGLE-POINT";

export interface VendorCount {
  vendor: string;
  refs: number;
}

export interface CategoryScore {
  category: string;
  totalRefs: number;
  vendors: VendorCount[];
  dominant: string | null;
  share: number | null;
  score: number | null;
  verdict: CategoryVerdict;
}

export function scoreCategory(category: string, counts: Map<string, number>, config: VendorMapConfig): CategoryScore {
  const vendors: VendorCount[] = [...counts.entries()]
    .map(([vendor, refs]) => ({ vendor, refs }))
    .sort((a, b) => b.refs - a.refs || a.vendor.localeCompare(b.vendor));
  const totalRefs = vendors.reduce((s, v) => s + v.refs, 0);
  if (totalRefs === 0) {
    return { category, totalRefs: 0, vendors: [], dominant: null, share: null, score: null, verdict: "NOT-DETECTED" };
  }
  if (totalRefs === 1) {
    return {
      category,
      totalRefs: 1,
      vendors,
      dominant: vendors[0].vendor,
      share: 1,
      score: null,
      verdict: "THIN",
    };
  }
  const dominant = vendors[0];
  const share = dominant.refs / totalRefs;
  const score = Math.round(100 * share * share);
  if (vendors.length === 1) {
    return { category, totalRefs, vendors, dominant: dominant.vendor, share, score, verdict: "SINGLE-POINT" };
  }
  const verdict: CategoryVerdict = score >= thresholdFor(config, category) ? "CONCENTRATED" : "DIVERSIFIED";
  return { category, totalRefs, vendors, dominant: dominant.vendor, share, score, verdict };
}

export interface OverallScore {
  score: number;
  verdict: OverallVerdict;
}

export function overallScore(categories: CategoryScore[]): OverallScore {
  const scored = categories.filter((c) => c.score !== null) as Array<CategoryScore & { score: number }>;
  const score = scored.length > 0 ? Math.max(...scored.map((c) => c.score)) : 0;
  let verdict: OverallVerdict = "DIVERSIFIED";
  if (categories.some((c) => c.verdict === "SINGLE-POINT")) verdict = "SINGLE-POINT";
  else if (categories.some((c) => c.verdict === "CONCENTRATED")) verdict = "CONCENTRATED";
  return { score, verdict };
}

/** Exit code for the CI gate: 0 DIVERSIFIED, 1 CONCENTRATED, 2 SINGLE-POINT. */
export function exitForVerdict(v: OverallVerdict): number {
  return v === "SINGLE-POINT" ? 2 : v === "CONCENTRATED" ? 1 : 0;
}
