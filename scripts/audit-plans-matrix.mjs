#!/usr/bin/env node
/**
 * MP-IMP-001 Fase 6 — audit allineamento docs/PIANI_MATRIX.md ↔ DB.
 *
 * Legge le tabelle `subscription_plans` + `plan_features` da Supabase
 * (via service-role key) e confronta con quanto dichiarato nel doc.
 *
 * USAGE:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/audit-plans-matrix.mjs
 *
 * Exit code 0 se allineato, 1 se trovate discrepanze.
 *
 * NOTE: questo script richiede DB access (service role). NON deve essere
 * eseguito in CI senza credenziali dedicate. Per ora e' un tool manuale
 * per Sales Engineering / Customer Success.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const matrixPath = join(repoRoot, "docs", "PIANI_MATRIX.md");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("❌ SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY richiesti");
  console.error("   Esempio: SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/audit-plans-matrix.mjs");
  process.exit(2);
}

// 1. Estrai feature flag dichiarate nel doc
const matrix = readFileSync(matrixPath, "utf8");
const docFlags = new Set();
const flagPattern = /`([a-z_][a-z0-9_]*)`/g;
let m;
while ((m = flagPattern.exec(matrix)) !== null) {
  const f = m[1];
  // Filtra solo chiavi che sembrano feature flag (snake_case, non camelCase)
  if (!/[A-Z]/.test(f) && f.length > 3 && !["true", "false", "null"].includes(f)) {
    docFlags.add(f);
  }
}

// 2. Fetch DB tables via REST
async function fetchTable(table, select = "*") {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}`;
  const res = await fetch(url, {
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
    },
  });
  if (!res.ok) throw new Error(`${table}: HTTP ${res.status}`);
  return res.json();
}

try {
  const plans = await fetchTable("subscription_plans", "id,code,name,price_monthly,is_active");
  const planFeatures = await fetchTable("plan_features", "plan_id,feature_key,is_enabled");

  const dbFlags = new Set(planFeatures.map((pf) => pf.feature_key));

  // Discrepancies
  const inDocNotDb = [...docFlags].filter((f) => !dbFlags.has(f));
  const inDbNotDoc = [...dbFlags].filter((f) => !docFlags.has(f));

  console.log(`📊 Plans attivi (DB): ${plans.filter((p) => p.is_active).length}`);
  console.log(`📊 Feature flag (DB): ${dbFlags.size}`);
  console.log(`📊 Feature flag citati nel doc: ${docFlags.size}`);

  if (inDocNotDb.length === 0 && inDbNotDoc.length === 0) {
    console.log("✅ Doc e DB allineati");
    process.exit(0);
  }

  if (inDocNotDb.length > 0) {
    console.error("🔴 Citati nel doc ma non in DB:", inDocNotDb.join(", "));
  }
  if (inDbNotDoc.length > 0) {
    console.error("🟡 Presenti in DB ma non documentati:", inDbNotDoc.join(", "));
  }
  process.exit(1);
} catch (e) {
  console.error("❌ Errore audit:", e.message);
  process.exit(2);
}
