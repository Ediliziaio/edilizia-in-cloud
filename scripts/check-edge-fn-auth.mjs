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
 *
 * Qui si guardano solo le privileged, e si pretende un controllo sull'UTENTE.
 * Il controllo su TUTTE le funzioni con verify_jwt = false (segreto del cron,
 * firma, token, oppure «pubblica di proposito» col motivo scritto) sta in
 * src/test/logic/funzioniSenzaJwtConControllo.test.ts e gira in CI con
 * test:critical: è nato il 20/09/2026, quando otto funzioni aperte senza
 * alcun controllo sono passate da qui perché non si chiamavano admin-*.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const configPath = join(repoRoot, "supabase", "config.toml");
const functionsDir = join(repoRoot, "supabase", "functions");

const config = readFileSync(configPath, "utf8");

// Riga per riga: una voce vale per la sezione in cui sta. La regex «dalla
// testata alla prossima parentesi quadra» dava a una sezione vuota (c'è:
// google-calendar-sync) il verify_jwt di quella dopo, che spariva dall'elenco.
// Stessa lettura di src/test/logic/leggiConfigFunzioni.ts.
const noVerifyJwt = new Set();
let sezione = null;
for (const riga of config.split("\n")) {
  const testata = riga.match(/^\[([^\]]+)\]\s*$/);
  if (testata) {
    sezione = testata[1].startsWith("functions.") ? testata[1].slice("functions.".length) : null;
    continue;
  }
  if (sezione && /^\s*verify_jwt\s*=\s*false\b/.test(riga)) noVerifyJwt.add(sezione);
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
