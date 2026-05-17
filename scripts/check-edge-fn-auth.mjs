#!/usr/bin/env node
/**
 * S2-04 CI guard
 *
 * Per ogni edge function "privileged" (admin-*, manage-*, sign-in-as-*,
 * create-super-admin, sign-up-*) con `verify_jwt = false` in config.toml,
 * verifica che il file index.ts importi `requireAuth` da _shared/auth.ts
 * oppure faccia auth check inline via `auth.getClaims` / `auth.getUser`.
 *
 * Esce con status 1 se trova privileged function senza auth check.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const configPath = join(repoRoot, "supabase", "config.toml");
const functionsDir = join(repoRoot, "supabase", "functions");

const config = readFileSync(configPath, "utf8");

// Match the section header and capture the block until the next [section] or EOF
const sectionRegex = /^\[functions\.([^\]]+)\]\s*\n([\s\S]*?)(?=\n\[|$)/gm;
const noVerifyJwt = new Set();
let m;
while ((m = sectionRegex.exec(config)) !== null) {
  const name = m[1];
  const block = m[2];
  if (/verify_jwt\s*=\s*false/.test(block)) noVerifyJwt.add(name);
}

const PRIVILEGED_PATTERN = /^(admin-|manage-|sign-in-as-|create-super-admin|sign-up-)/;
let failed = false;

for (const name of noVerifyJwt) {
  if (!PRIVILEGED_PATTERN.test(name)) continue;
  const indexPath = join(functionsDir, name, "index.ts");
  let src;
  try {
    src = readFileSync(indexPath, "utf8");
  } catch {
    continue;
  }

  const hasRequireAuth = /from\s+["']\.\.\/_shared\/auth(\.ts)?["']/.test(src);
  const hasInlineAuth = /auth\.(getClaims|getUser)\b/.test(src);
  // Bootstrap/setup endpoints (es. create-super-admin) usano shared secret
  // via header custom (x-bootstrap-key, x-internal-secret, x-webhook-signature).
  const hasSharedSecret = /headers\.get\(["']x-(bootstrap-key|internal-secret|webhook-signature|cron-secret)["']\)/i.test(src);

  if (!hasRequireAuth && !hasInlineAuth && !hasSharedSecret) {
    console.error(`❌ ${indexPath}: privileged function without auth check`);
    failed = true;
  }
}

if (failed) {
  console.error("");
  console.error("→ Import { requireAuth, requireRole } from \"../_shared/auth.ts\"");
  console.error("→ See: supabase/functions/_shared/AUTH_CONVENTIONS.md");
  process.exit(1);
}
console.log("✅ All privileged edge functions have auth check.");
