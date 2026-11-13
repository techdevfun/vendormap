/**
 * Scanner: reads a repo and counts vendor references per category.
 *
 * Evidence discipline (blueprint R5):
 * - Output contains file paths, line numbers and counts ONLY.
 *   No file content is ever printed, stored or embedded in output.
 * - Real `.env` files, `*secret*` files, `*.pem` and `*.key` files are
 *   skipped entirely. Only `.env.example` / `.env.sample` /
 *   `.env.template` files are read, and only for KEY NAMES (the text
 *   left of the first `=`); values are discarded unread.
 * - Lockfiles are parsed for package NAMES only.
 */
import { readdirSync, readFileSync, lstatSync, existsSync } from "node:fs";
import { join, relative, basename, extname } from "node:path";
import { CATEGORY_NAMES, matchVendors, matchEnvKey } from "./vendors.js";
import { scoreCategory, overallScore } from "./scoring.js";
const SKIP_DIRS = new Set([
    "node_modules",
    ".git",
    "dist",
    "build",
    ".venv",
    "venv",
    "__pycache__",
    "vendor",
    ".terraform",
    ".idea",
    ".vscode",
]);
const SKIP_FILE_RES = [/\.env($|\.)/, /secret/i, /\.pem$/, /\.key$/, /\.crt$/, /\.p12$/, /\.pfx$/];
const ENV_TEMPLATE_RES = [/\.env\.example$/, /\.env\.sample$/, /\.env\.template$/];
const SOURCE_KINDS = [
    "terraform",
    "kubernetes",
    "dockerfile",
    "package-manifest",
    "lockfile",
    "workflows",
    "code-imports",
    "env-template",
];
function newCounts() {
    const m = new Map();
    for (const c of CATEGORY_NAMES)
        m.set(c, new Map());
    return m;
}
function addRef(counts, category, vendor, file, lineNo, raw) {
    const cat = counts.get(category);
    if (!cat)
        return;
    let v = cat.get(vendor);
    if (!v) {
        v = new Map();
        cat.set(vendor, v);
    }
    let f = v.get(file);
    if (!f) {
        f = { lines: [], raw: new Set() };
        v.set(file, f);
    }
    f.lines.push(lineNo);
    if (raw)
        f.raw.add(raw);
}
function isSkippedFile(rel) {
    const base = basename(rel);
    if (ENV_TEMPLATE_RES.some((re) => re.test(base)))
        return false; // templates: key names only
    return SKIP_FILE_RES.some((re) => re.test(base));
}
function isBinary(buf) {
    return buf.subarray(0, 8000).includes(0);
}
function readLines(full) {
    let buf;
    try {
        buf = readFileSync(full);
    }
    catch {
        return null;
    }
    if (isBinary(buf))
        return null;
    return buf.toString("utf8").split("\n");
}
const TF_PROVIDER = {
    aws: { category: "cloud", vendor: "aws" },
    azurerm: { category: "cloud", vendor: "azure" },
    google: { category: "cloud", vendor: "gcp" },
    cloudflare: { category: "dns-cdn", vendor: "cloudflare" },
    digitalocean: { category: "cloud", vendor: "digitalocean" },
};
const TF_PREFIX = {
    aws: { category: "cloud", vendor: "aws" },
    azurerm: { category: "cloud", vendor: "azure" },
    google: { category: "cloud", vendor: "gcp" },
    cloudflare: { category: "dns-cdn", vendor: "cloudflare" },
    digitalocean: { category: "cloud", vendor: "digitalocean" },
};
const TF_NON_VENDOR_PROVIDERS = new Set(["random", "local", "null", "time", "tls", "external", "http"]);
function scanTerraform(lines, rel, counts) {
    lines.forEach((line, i) => {
        const prov = line.match(/^\s*provider\s+"([^"]+)"/);
        if (prov) {
            // Utility providers (random, local, ...) are not vendors: skip.
            if (TF_NON_VENDOR_PROVIDERS.has(prov[1]))
                return;
            const known = TF_PROVIDER[prov[1]];
            if (known)
                addRef(counts, known.category, known.vendor, rel, i + 1, prov[1]);
            else
                addRef(counts, "cloud", "unknown", rel, i + 1, prov[1]);
            return;
        }
        const res = line.match(/^\s*resource\s+"([^"]+)"/);
        if (res) {
            const prefix = res[1].split("_")[0];
            const known = TF_PREFIX[prefix];
            if (known)
                addRef(counts, known.category, known.vendor, rel, i + 1);
        }
    });
}
function scanDockerfile(lines, rel, counts) {
    lines.forEach((line, i) => {
        const m = line.match(/^\s*FROM\s+(?:--platform=\S+\s+)?(\S+)/i);
        if (!m)
            return;
        const image = m[1];
        if (image === "scratch")
            return;
        const parts = image.split("/");
        let registry = "docker-hub";
        let raw;
        if (parts.length > 1 && (parts[0].includes(".") || parts[0].includes(":") || parts[0] === "localhost")) {
            const host = parts[0];
            if (/ghcr\.io/i.test(host))
                registry = "ghcr";
            else if (/\.dkr\.ecr\./i.test(host) || /ecr\.amazonaws/i.test(host))
                registry = "ecr";
            else if (/gcr\.io/i.test(host) || /-docker\.pkg\.dev/i.test(host))
                registry = "gcr";
            else if (/\.azurecr\.io/i.test(host))
                registry = "acr";
            else if (/quay\.io/i.test(host))
                registry = "quay";
            else if (/docker\.io/i.test(host))
                registry = "docker-hub";
            else {
                registry = "unknown";
                raw = host;
            }
        }
        addRef(counts, "registry", registry, rel, i + 1, raw);
        // The image name itself can name a vendor (nvidia/cuda -> gpu/nvidia,
        // postgres:16 -> data/postgres). Only the image token is matched.
        for (const v of matchVendors("gpu", image))
            addRef(counts, "gpu", v, rel, i + 1);
        for (const v of matchVendors("data", image))
            addRef(counts, "data", v, rel, i + 1);
    });
}
function depNamesFromPackageJson(text) {
    let json;
    try {
        json = JSON.parse(text);
    }
    catch {
        return [];
    }
    const names = [];
    for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
        const deps = json[field];
        if (deps && typeof deps === "object")
            names.push(...Object.keys(deps));
    }
    return names;
}
function scanDepNames(names, rel, lineNo, counts) {
    for (const name of names) {
        for (const cat of CATEGORY_NAMES) {
            for (const v of matchVendors(cat, name))
                addRef(counts, cat, v, rel, lineNo);
        }
    }
}
function scanPackageLock(text, rel, counts) {
    let json;
    try {
        json = JSON.parse(text);
    }
    catch {
        return [];
    }
    const names = [];
    const packages = json["packages"];
    if (packages && typeof packages === "object") {
        for (const key of Object.keys(packages)) {
            const m = key.match(/node_modules\/([^/]+(?:\/[^/]+)?)$/);
            if (m && !key.endsWith("node_modules"))
                names.push(m[1].replace(/^@/, "@"));
        }
    }
    const deps = json["dependencies"];
    if (deps && typeof deps === "object")
        names.push(...Object.keys(deps));
    scanDepNames(names, rel, 1, counts);
    return names;
}
function scanYamlLock(lines, rel, counts) {
    // yarn.lock / pnpm-lock.yaml: top-level "<name>@<range>:" entries.
    // Names only; versions and integrity hashes are never recorded.
    const names = new Set();
    for (const line of lines) {
        const m = line.match(/^"?(@?[^"\s@][^"\s]*?)@[^:\s]*"?:\s*$/);
        if (m && !m[1].startsWith("."))
            names.add(m[1]);
    }
    scanDepNames([...names], rel, 1, counts);
}
function scanWorkflow(lines, rel, counts) {
    lines.forEach((line, i) => {
        const uses = line.match(/^\s*-\s*uses:\s*(\S+)/) || line.match(/^\s*uses:\s*(\S+)/);
        if (uses) {
            addRef(counts, "ci", "github-actions", rel, i + 1);
            return;
        }
        const runsOn = line.match(/^\s*runs-on:\s*(.+?)\s*$/);
        if (runsOn) {
            const v = runsOn[1].trim().replace(/["'[\]]/g, "");
            if (/^(ubuntu|windows|macos)-/.test(v) || v === "self-hosted") {
                addRef(counts, "ci", "github-actions", rel, i + 1);
            }
        }
    });
}
function scanK8sYaml(lines, rel, counts) {
    lines.forEach((line, i) => {
        const img = line.match(/^\s*(?:image|imageName):\s*"?([^"\s]+)"?/);
        if (img) {
            const image = img[1];
            const parts = image.split("/");
            let registry = "docker-hub";
            let raw;
            if (parts.length > 1 && (parts[0].includes(".") || parts[0].includes(":") || parts[0] === "localhost")) {
                const host = parts[0];
                if (/ghcr\.io/i.test(host))
                    registry = "ghcr";
                else if (/\.dkr\.ecr\./i.test(host) || /ecr\.amazonaws/i.test(host))
                    registry = "ecr";
                else if (/gcr\.io/i.test(host) || /-docker\.pkg\.dev/i.test(host))
                    registry = "gcr";
                else if (/\.azurecr\.io/i.test(host))
                    registry = "acr";
                else if (/quay\.io/i.test(host))
                    registry = "quay";
                else if (/docker\.io/i.test(host))
                    registry = "docker-hub";
                else {
                    registry = "unknown";
                    raw = host;
                }
            }
            addRef(counts, "registry", registry, rel, i + 1, raw);
            for (const v of matchVendors("gpu", image))
                addRef(counts, "gpu", v, rel, i + 1);
            for (const v of matchVendors("data", image))
                addRef(counts, "data", v, rel, i + 1);
            return;
        }
        for (const cat of ["cloud", "gpu", "model", "identity", "dns-cdn", "payments", "data", "ci"]) {
            for (const v of matchVendors(cat, line))
                addRef(counts, cat, v, rel, i + 1);
        }
    });
}
const IMPORT_RE = /^\s*(import\s|from\s|const\s+\w+\s*=\s*require\(|require\(|export\s.*\sfrom\s)/;
function scanCode(lines, rel, counts) {
    lines.forEach((line, i) => {
        if (!IMPORT_RE.test(line) && !/\bimport\s*\(/.test(line))
            return;
        for (const cat of CATEGORY_NAMES) {
            for (const v of matchVendors(cat, line))
                addRef(counts, cat, v, rel, i + 1);
        }
    });
}
function scanEnvTemplate(lines, rel, counts) {
    lines.forEach((line, i) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("export "))
            return;
        // KEY NAME ONLY: everything after the first `=` is a value and is
        // discarded unread - never stored, never printed.
        const key = trimmed.split("=")[0].trim();
        if (!key)
            return;
        for (const hit of matchEnvKey(key))
            addRef(counts, hit.category, hit.vendor, rel, i + 1);
    });
}
export function scanDir(dir, config) {
    const counts = newCounts();
    const found = new Set();
    const absDir = dir;
    function walk(d) {
        let entries;
        try {
            entries = readdirSync(d, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const e of entries) {
            const full = join(d, e.name);
            const rel = relative(absDir, full);
            if (e.isSymbolicLink())
                continue;
            if (e.isDirectory()) {
                if (SKIP_DIRS.has(e.name))
                    continue;
                if (e.name.startsWith(".") && e.name !== ".github" && e.name !== ".circleci")
                    continue;
                walk(full);
                continue;
            }
            if (!e.isFile())
                continue;
            if (isSkippedFile(rel))
                continue;
            const base = basename(rel);
            const ext = extname(rel).toLowerCase();
            const lines = readLines(full);
            if (lines === null)
                continue;
            const isWorkflow = rel.includes(".github/workflows/") && (ext === ".yml" || ext === ".yaml");
            if (ext === ".tf") {
                found.add("terraform");
                scanTerraform(lines, rel, counts);
            }
            else if (/^dockerfile/i.test(base)) {
                found.add("dockerfile");
                scanDockerfile(lines, rel, counts);
            }
            else if (base === "package.json") {
                found.add("package-manifest");
                scanDepNames(depNamesFromPackageJson(lines.join("\n")), rel, 1, counts);
            }
            else if (base === "package-lock.json") {
                found.add("lockfile");
                scanPackageLock(lines.join("\n"), rel, counts);
            }
            else if (base === "yarn.lock" || base === "pnpm-lock.yaml") {
                found.add("lockfile");
                scanYamlLock(lines, rel, counts);
            }
            else if (isWorkflow) {
                found.add("workflows");
                scanWorkflow(lines, rel, counts);
            }
            else if (ext === ".yml" || ext === ".yaml") {
                found.add("kubernetes");
                scanK8sYaml(lines, rel, counts);
            }
            else if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py"].includes(ext)) {
                found.add("code-imports");
                scanCode(lines, rel, counts);
            }
            else if (ENV_TEMPLATE_RES.some((re) => re.test(base))) {
                found.add("env-template");
                scanEnvTemplate(lines, rel, counts);
            }
        }
    }
    walk(absDir);
    const categories = CATEGORY_NAMES.map((cat) => {
        const catCounts = new Map();
        const vendorMap = counts.get(cat);
        for (const [vendor, files] of vendorMap) {
            let total = 0;
            for (const f of files.values())
                total += f.lines.length;
            catCounts.set(vendor, total);
        }
        // Allowlisted vendors are reported but excluded from scoring.
        const scoredCounts = new Map();
        for (const [vendor, n] of catCounts) {
            if (!config.allowlist.includes(vendor))
                scoredCounts.set(vendor, n);
        }
        const scored = scoreCategory(cat, scoredCounts, config);
        const vendors = [...vendorMap.entries()]
            .map(([vendor, files]) => {
            let refs = 0;
            const fileList = [];
            for (const [file, f] of files) {
                refs += f.lines.length;
                fileList.push({ file, lines: [...f.lines].sort((a, b) => a - b), count: f.lines.length });
            }
            const raw = [...new Set([...files.values()].flatMap((f) => [...f.raw]))];
            const ev = {
                vendor,
                refs,
                files: fileList.sort((a, b) => a.file.localeCompare(b.file)),
            };
            if (raw.length > 0)
                ev.raw = raw.sort();
            return ev;
        })
            .sort((a, b) => b.refs - a.refs || a.vendor.localeCompare(b.vendor));
        return {
            category: cat,
            totalRefs: scored.totalRefs,
            dominant: scored.dominant,
            share: scored.share,
            score: scored.score,
            verdict: scored.verdict,
            vendors,
        };
    });
    const scores = categories.map((c) => ({
        category: c.category,
        totalRefs: c.totalRefs,
        vendors: c.vendors.map((v) => ({ vendor: v.vendor, refs: v.refs })),
        dominant: c.dominant,
        share: c.share,
        score: c.score,
        verdict: c.verdict,
    }));
    const overall = overallScore(scores);
    return {
        tool: "vendormap",
        version: "0.1.0",
        dir: relative(process.cwd(), absDir) || absDir,
        generatedAt: new Date().toISOString(),
        overall,
        categories,
        coverage: {
            found: SOURCE_KINDS.filter((k) => found.has(k)),
            absent: SOURCE_KINDS.filter((k) => !found.has(k)),
        },
        config: { concentratedThreshold: config.concentratedThreshold, thresholds: config.thresholds },
    };
}
export function dirExists(dir) {
    try {
        return existsSync(dir) && lstatSync(dir).isDirectory();
    }
    catch {
        return false;
    }
}
