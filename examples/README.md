# Examples

Two synthetic fixtures so you can see a SINGLE-POINT stack and a DIVERSIFIED stack side by side. Both are invented: company names, references and counts are made up to show the rules. Their scores are the fixtures' own, not measurements of any real company.

## acme-shop - every layer single-vendor

- NVIDIA GPUs, AWS, OpenAI, ECR, Auth0, Cloudflare, Stripe, GitHub Actions, Postgres.
- `vendormap scan examples/acme-shop` - overall 100 (SINGLE-POINT), all 9 categories SINGLE-POINT.
- `vendormap check examples/acme-shop` - exit 2.

## diversified-shop - every layer split across two vendors

- Cloud AWS + GCP, GPU NVIDIA + AMD, model OpenAI + Anthropic, registry Docker Hub + GHCR, identity Auth0 + Clerk, DNS-CDN Cloudflare + Fastly, payments Stripe + PayPal, CI GitHub Actions + CircleCI, data Postgres + MongoDB.
- `vendormap scan examples/diversified-shop` - overall 44 (DIVERSIFIED).
- `vendormap check examples/diversified-shop` - exit 0.

## What each file exercises

| File | Scanner source |
|---|---|
| `terraform/main.tf` | provider blocks + resource prefixes |
| `k8s/deployment.yaml` | image registries, GPU annotations |
| `Dockerfile` | `FROM` registries |
| `package.json` / `package-lock.json` | dependency names (lockfile names only) |
| `.github/workflows/ci.yml` | `uses:` + `runs-on:` |
| `.circleci/config.yml` (diversified only) | CircleCI orb reference |
| `src/app.py` | code imports |
| `.env.example` | env KEY NAMES only (values are placeholders, never read) |
