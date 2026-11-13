import { thresholdFor } from "./config.js";
export function scoreCategory(category, counts, config) {
    const vendors = [...counts.entries()]
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
    const verdict = score >= thresholdFor(config, category) ? "CONCENTRATED" : "DIVERSIFIED";
    return { category, totalRefs, vendors, dominant: dominant.vendor, share, score, verdict };
}
export function overallScore(categories) {
    const scored = categories.filter((c) => c.score !== null);
    const score = scored.length > 0 ? Math.max(...scored.map((c) => c.score)) : 0;
    let verdict = "DIVERSIFIED";
    if (categories.some((c) => c.verdict === "SINGLE-POINT"))
        verdict = "SINGLE-POINT";
    else if (categories.some((c) => c.verdict === "CONCENTRATED"))
        verdict = "CONCENTRATED";
    return { score, verdict };
}
/** Exit code for the CI gate: 0 DIVERSIFIED, 1 CONCENTRATED, 2 SINGLE-POINT. */
export function exitForVerdict(v) {
    return v === "SINGLE-POINT" ? 2 : v === "CONCENTRATED" ? 1 : 0;
}
