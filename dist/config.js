/**
 * vendormap.json config: thresholds, per-category overrides, weights,
 * allowlist. Weights are stored and validated but reserved for a future
 * weighted rollup - v0.1.0 overall score is the worst category score,
 * as published in the README.
 */
import { readFileSync, existsSync } from "node:fs";
import { CATEGORY_NAMES } from "./vendors.js";
export const DEFAULT_CONFIG = {
    version: 1,
    concentratedThreshold: 50,
    thresholds: {},
    weights: {},
    allowlist: [],
    alternativesVerified: "2026-11-13",
};
export function defaultConfigJson() {
    return JSON.stringify({
        version: 1,
        concentratedThreshold: 50,
        thresholds: { gpu: 40, model: 40 },
        weights: { cloud: 1, gpu: 1, model: 1, registry: 1, identity: 1, "dns-cdn": 1, payments: 1, ci: 1, data: 1 },
        allowlist: [],
        alternativesVerified: "2026-11-13",
        _comment: "concentratedThreshold: score at or above this means CONCENTRATED. thresholds: per-category overrides. weights: reserved for a future weighted rollup; v0.1.0 overall is the worst category score. allowlist: vendor names ignored in scoring (still listed).",
    }, null, 2) + "\n";
}
export function thresholdFor(config, category) {
    const t = config.thresholds[category];
    if (typeof t === "number" && t >= 0 && t <= 100)
        return t;
    return config.concentratedThreshold;
}
export function loadConfig(path, dir) {
    const candidates = path ? [path] : [`${dir}/vendormap.json`];
    for (const p of candidates) {
        if (existsSync(p)) {
            const raw = JSON.parse(readFileSync(p, "utf8"));
            const cfg = {
                version: 1,
                concentratedThreshold: typeof raw.concentratedThreshold === "number" ? raw.concentratedThreshold : DEFAULT_CONFIG.concentratedThreshold,
                thresholds: raw.thresholds && typeof raw.thresholds === "object" ? raw.thresholds : {},
                weights: raw.weights && typeof raw.weights === "object" ? raw.weights : {},
                allowlist: Array.isArray(raw.allowlist) ? raw.allowlist.filter((x) => typeof x === "string") : [],
                alternativesVerified: typeof raw.alternativesVerified === "string" ? raw.alternativesVerified : DEFAULT_CONFIG.alternativesVerified,
            };
            validateConfig(cfg);
            return cfg;
        }
    }
    return { ...DEFAULT_CONFIG, thresholds: {}, weights: {}, allowlist: [] };
}
export function validateConfig(cfg) {
    if (cfg.concentratedThreshold < 0 || cfg.concentratedThreshold > 100) {
        throw new Error("vendormap.json: concentratedThreshold must be 0-100");
    }
    for (const [cat, t] of Object.entries(cfg.thresholds)) {
        if (!CATEGORY_NAMES.includes(cat))
            throw new Error(`vendormap.json: unknown category in thresholds: ${cat}`);
        if (typeof t !== "number" || t < 0 || t > 100) {
            throw new Error(`vendormap.json: thresholds.${cat} must be 0-100`);
        }
    }
    for (const [cat, w] of Object.entries(cfg.weights)) {
        if (!CATEGORY_NAMES.includes(cat))
            throw new Error(`vendormap.json: unknown category in weights: ${cat}`);
        if (typeof w !== "number" || w < 0)
            throw new Error(`vendormap.json: weights.${cat} must be >= 0`);
    }
}
