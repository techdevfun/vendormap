/**
 * Vendor tables: category -> vendor -> match patterns.
 *
 * A pattern matches one reference on one line. The scanner records only
 * the file path, the line number and a count - never the line content.
 * Unknown vendors are reported as `unknown` with their raw reference,
 * never silently dropped and never auto-classified.
 */
function v(vendor, ...patterns) {
    return { vendor, patterns: patterns.map((p) => new RegExp(p, "i")) };
}
export const CATEGORIES = [
    {
        name: "cloud",
        vendors: [
            v("aws", "\\baws\\b", "amazonaws\\.com", "\\baws_", "@aws-sdk/", "\\bboto3\\b", "amazon web services"),
            v("azure", "\\bazurerm?_", "\\bazure\\b", "@azure/", "azure\\.microsoft", "microsoft azure"),
            v("gcp", "\\bgoogle_", "googleapis\\.com", "@google-cloud/", "\\bgcp\\b", "google cloud platform"),
            v("digitalocean", "digitalocean"),
            v("oracle", "oraclecloud", "oracle cloud"),
            v("alibaba", "aliyun", "alibaba cloud"),
        ],
    },
    {
        name: "gpu",
        vendors: [
            v("nvidia", "nvidia", "\\bcuda\\b", "\\bcudnn\\b", "\\bnvcc\\b", "nvidia\\.com"),
            v("amd", "\\brocm\\b", "\\bradeon\\b", "\\bamd\\b[^\\n]{0,20}gpu"),
            v("intel", "\\boneapi\\b", "intel[^\\n]{0,20}gpu", "\\bgaudi\\b"),
            v("google-tpu", "\\btpu\\b"),
        ],
    },
    {
        name: "model",
        vendors: [
            v("openai", "\\bopenai\\b", "api\\.openai\\.com"),
            v("anthropic", "\\banthropic\\b", "api\\.anthropic\\.com", "@anthropic-ai/"),
            v("google", "\\bgemini\\b", "generative-ai", "\\bvertexai\\b", "vertex ai"),
            v("meta", "\\bllama\\b", "meta ai"),
            v("mistral", "\\bmistral\\b"),
            v("cohere", "\\bcohere\\b"),
            v("ollama", "\\bollama\\b", "llama\\.cpp"),
        ],
    },
    {
        name: "registry",
        vendors: [
            v("docker-hub", "docker\\.io", "hub\\.docker\\.com"),
            v("ghcr", "ghcr\\.io"),
            v("ecr", "\\.dkr\\.ecr\\.", "ecr\\.amazonaws"),
            v("gcr", "gcr\\.io", "-docker\\.pkg\\.dev"),
            v("acr", "\\.azurecr\\.io"),
            v("quay", "quay\\.io"),
        ],
    },
    {
        name: "identity",
        vendors: [
            v("auth0", "\\bauth0\\b"),
            v("clerk", "\\bclerk\\b"),
            v("okta", "\\bokta\\b"),
            v("cognito", "\\bcognito\\b"),
            v("entra", "\\bentra\\b", "azure ad", "\\bazuread\\b"),
            v("firebase", "\\bfirebase\\b"),
        ],
    },
    {
        name: "dns-cdn",
        vendors: [
            v("cloudflare", "\\bcloudflare\\b"),
            v("akamai", "\\bakamai\\b"),
            v("fastly", "\\bfastly\\b"),
            v("cloudfront", "\\bcloudfront\\b"),
            v("vercel", "\\bvercel\\b"),
        ],
    },
    {
        name: "payments",
        vendors: [
            v("stripe", "\\bstripe\\b"),
            v("paypal", "\\bpaypal\\b"),
            v("adyen", "\\badyen\\b"),
            v("square", "\\bsquare\\b"),
            v("braintree", "\\bbraintree\\b"),
        ],
    },
    {
        name: "ci",
        vendors: [
            v("github-actions", "actions/", "github\\.actions", "runs-on:"),
            v("gitlab-ci", "gitlab-ci", "gitlab\\.com"),
            v("circleci", "circleci"),
            v("jenkins", "\\bjenkins\\b"),
            v("buildkite", "\\bbuildkite\\b"),
        ],
    },
    {
        name: "data",
        vendors: [
            v("postgres", "\\bpostgres", "psycopg2?", "node-postgres"),
            v("mysql", "\\bmysql\\b"),
            v("mongodb", "\\bmongodb\\b", "\\bmongo\\b"),
            v("snowflake", "\\bsnowflake\\b"),
            v("databricks", "\\bdatabricks\\b"),
            v("supabase", "\\bsupabase\\b"),
            v("redis", "\\bredis\\b"),
            v("kafka", "\\bkafka\\b"),
            v("elasticsearch", "\\belasticsearch\\b"),
        ],
    },
];
export const CATEGORY_NAMES = CATEGORIES.map((c) => c.name);
export function categoryDef(name) {
    return CATEGORIES.find((c) => c.name === name);
}
/** Match one text line against a category's vendor table. */
export function matchVendors(category, line) {
    const def = categoryDef(category);
    if (!def)
        return [];
    const found = [];
    for (const vp of def.vendors) {
        if (vp.patterns.some((re) => re.test(line)))
            found.push(vp.vendor);
    }
    return found;
}
/**
 * Env-key -> vendor mapping. Only the KEY NAME (left of the first `=`)
 * is ever read; the value is discarded unread. Real `.env` files are
 * skipped entirely - only `.env.example` / `.env.sample` / `.env.template`
 * files are scanned this way.
 */
export const ENV_KEY_VENDORS = [
    { category: "cloud", vendor: "aws", keyPattern: /^AWS_/ },
    { category: "cloud", vendor: "azure", keyPattern: /^AZURE_/ },
    { category: "cloud", vendor: "gcp", keyPattern: /^GCP_|^GOOGLE_CLOUD_/ },
    { category: "model", vendor: "openai", keyPattern: /^OPENAI_/ },
    { category: "model", vendor: "anthropic", keyPattern: /^ANTHROPIC_/ },
    { category: "model", vendor: "google", keyPattern: /^GEMINI_|^GOOGLE_AI_/ },
    { category: "model", vendor: "mistral", keyPattern: /^MISTRAL_/ },
    { category: "model", vendor: "cohere", keyPattern: /^COHERE_/ },
    { category: "payments", vendor: "stripe", keyPattern: /^STRIPE_/ },
    { category: "payments", vendor: "paypal", keyPattern: /^PAYPAL_/ },
    { category: "payments", vendor: "adyen", keyPattern: /^ADYEN_/ },
    { category: "identity", vendor: "auth0", keyPattern: /^AUTH0_/ },
    { category: "identity", vendor: "clerk", keyPattern: /^CLERK_/ },
    { category: "identity", vendor: "okta", keyPattern: /^OKTA_/ },
    { category: "identity", vendor: "cognito", keyPattern: /^COGNITO_/ },
    { category: "dns-cdn", vendor: "cloudflare", keyPattern: /^CLOUDFLARE_/ },
    { category: "data", vendor: "postgres", keyPattern: /^POSTGRES_|^DATABASE_URL$/ },
    { category: "data", vendor: "mongodb", keyPattern: /^MONGO/ },
    { category: "data", vendor: "redis", keyPattern: /^REDIS_/ },
    { category: "data", vendor: "snowflake", keyPattern: /^SNOWFLAKE_/ },
];
export function matchEnvKey(key) {
    return ENV_KEY_VENDORS.filter((e) => e.keyPattern.test(key)).map((e) => ({
        category: e.category,
        vendor: e.vendor,
    }));
}
/**
 * Second-source alternatives, stamped with a verification date.
 * Alternatives are NOT drop-in replacements and switching costs are
 * real - the report and the README say so, and no switching-cost or
 * savings number is ever invented. Re-verify before acting.
 */
export const ALTERNATIVES_VERIFIED = "2026-11-13";
export const ALTERNATIVES = {
    cloud: {
        aws: ["Google Cloud (GCP)", "Microsoft Azure"],
        azure: ["Amazon Web Services (AWS)", "Google Cloud (GCP)"],
        gcp: ["Amazon Web Services (AWS)", "Microsoft Azure"],
        digitalocean: ["Amazon Web Services (AWS)", "Google Cloud (GCP)", "Microsoft Azure"],
        oracle: ["Amazon Web Services (AWS)", "Microsoft Azure", "Google Cloud (GCP)"],
        alibaba: ["Amazon Web Services (AWS)", "Microsoft Azure", "Google Cloud (GCP)"],
    },
    gpu: {
        nvidia: ["AMD ROCm", "Intel oneAPI", "cloud TPUs"],
        amd: ["NVIDIA CUDA", "Intel oneAPI"],
        intel: ["NVIDIA CUDA", "AMD ROCm"],
        "google-tpu": ["NVIDIA GPUs", "AMD GPUs"],
    },
    model: {
        openai: ["Anthropic Claude", "Google Gemini", "local models (Ollama)"],
        anthropic: ["OpenAI", "Google Gemini", "local models (Ollama)"],
        google: ["OpenAI", "Anthropic Claude", "local models (Ollama)"],
        meta: ["OpenAI", "Anthropic Claude", "Mistral"],
        mistral: ["OpenAI", "Anthropic Claude", "local models (Ollama)"],
        cohere: ["OpenAI", "Anthropic Claude"],
        ollama: ["OpenAI", "Anthropic Claude (hosted)"],
    },
    registry: {
        "docker-hub": ["GitHub Container Registry (GHCR)", "Quay", "Amazon ECR", "Google Artifact Registry"],
        ghcr: ["Docker Hub", "Quay"],
        ecr: ["Google Artifact Registry", "Azure Container Registry", "GHCR"],
        gcr: ["Amazon ECR", "Azure Container Registry", "GHCR"],
        acr: ["Amazon ECR", "Google Artifact Registry", "GHCR"],
        quay: ["Docker Hub", "GHCR"],
    },
    identity: {
        auth0: ["Clerk", "Okta", "Keycloak (self-hosted)"],
        clerk: ["Auth0", "Okta"],
        okta: ["Auth0", "Microsoft Entra ID"],
        cognito: ["Auth0", "Clerk"],
        entra: ["Okta", "Auth0"],
        firebase: ["Auth0", "Clerk", "Supabase Auth"],
    },
    "dns-cdn": {
        cloudflare: ["Fastly", "Akamai", "AWS CloudFront"],
        akamai: ["Cloudflare", "Fastly"],
        fastly: ["Cloudflare", "Akamai"],
        cloudfront: ["Cloudflare", "Fastly"],
        vercel: ["Cloudflare", "Netlify"],
    },
    payments: {
        stripe: ["PayPal", "Adyen", "Square"],
        paypal: ["Stripe", "Adyen"],
        adyen: ["Stripe", "PayPal"],
        square: ["Stripe", "PayPal"],
        braintree: ["Stripe", "Adyen"],
    },
    ci: {
        "github-actions": ["GitLab CI", "CircleCI", "Jenkins"],
        "gitlab-ci": ["GitHub Actions", "CircleCI"],
        circleci: ["GitHub Actions", "GitLab CI"],
        jenkins: ["GitHub Actions", "GitLab CI"],
        buildkite: ["GitHub Actions", "CircleCI"],
    },
    data: {
        postgres: ["MySQL", "MongoDB", "CockroachDB"],
        mysql: ["PostgreSQL", "MariaDB"],
        mongodb: ["PostgreSQL", "DynamoDB"],
        snowflake: ["BigQuery", "Databricks"],
        databricks: ["Snowflake", "BigQuery"],
        supabase: ["Firebase", "Neon"],
        redis: ["Memcached", "Valkey"],
        kafka: ["Redpanda", "Pulsar"],
        elasticsearch: ["OpenSearch", "Meilisearch"],
    },
};
export function alternativesFor(category, vendor) {
    return (ALTERNATIVES[category] && ALTERNATIVES[category][vendor]) || [];
}
