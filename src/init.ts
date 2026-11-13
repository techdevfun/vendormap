/**
 * `vendormap init`: scaffold vendormap.json + example fixture pointers.
 * Refuses to overwrite an existing vendormap.json.
 */
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { defaultConfigJson } from "./config.js";

export const INIT_README = `# vendormap examples
#
# Two synthetic fixtures ship with vendormap so you can see a
# SINGLE-POINT stack and a DIVERSIFIED stack side by side:
#
#   examples/acme-shop/        - every layer single-vendor (NVIDIA GPUs,
#                                AWS, OpenAI, Cloudflare, Stripe).
#                                ` + "`vendormap check` exits 2 here." + `
#   examples/diversified-shop/ - each layer split across two vendors.
#                                ` + "`vendormap check` exits 0 here." + `
#
# Both fixtures are SYNTHETIC: invented company names, invented
# reference counts. Their scores are the fixtures' own, not real
# measurements of any real company.
`;

export function runInit(dir: string): { created: string[]; alreadyExisted: boolean } {
  mkdirSync(dir, { recursive: true });
  const configPath = join(dir, "vendormap.json");
  if (existsSync(configPath)) {
    return { created: [], alreadyExisted: true };
  }
  writeFileSync(configPath, defaultConfigJson());
  const created = ["vendormap.json"];
  return { created, alreadyExisted: false };
}
