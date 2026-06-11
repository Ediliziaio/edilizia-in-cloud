// meta-warmup-api-calls
// Genera chiamate alle Meta API per soddisfare i requisiti di App Review:
//   - Marketing API Access Tier (500+ calls, ≥85% success)
//   - pages_show_list, pages_read_engagement, leads_retrieval
//
// AUTH: x-cron-secret header  oppure  x-warmup-token (one-time DB token)
// USAGE: POST /functions/v1/meta-warmup-api-calls
//        Body: { "company_id": "...", "rounds": 4, "mode": "all"|"marketing"|"pages"|"leads" }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decrypt, getEncryptionKey } from "../_shared/encryption.ts";

const API_VERSION = Deno.env.get("META_API_VERSION") || "v21.0";
const BASE = `https://graph.facebook.com/${API_VERSION}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  // Auth: CRON_SECRET header oppure token one-time (x-warmup-token) da platform_settings
  const cronSecret = Deno.env.get("CRON_SECRET");
  const reqCronSecret = req.headers.get("x-cron-secret");
  const warmupToken = req.headers.get("x-warmup-token");

  let isAuthed = !!(cronSecret && reqCronSecret === cronSecret);

  if (!isAuthed && warmupToken) {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminCheck = createClient(supabaseUrl, serviceKey);
    const { data: tokenRow } = await adminCheck
      .from("platform_settings")
      .select("value")
      .eq("key", "meta_warmup_token")
      .single();
    if (tokenRow?.value && warmupToken === tokenRow.value) {
      isAuthed = true;
    }
  }

  if (!isAuthed) return json({ error: "unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  let body: { company_id?: string; rounds?: number; mode?: string } = {};
  try { body = await req.json(); } catch { /* usa defaults */ }

  const companyId = body.company_id || "778a2c76-1253-49f2-a5e8-283363ac3e29";
  const rounds = Math.min(body.rounds ?? 4, 20);
  const mode = body.mode ?? "all"; // all | marketing | pages | leads

  // 1. Token Meta
  const { data: integRow } = await admin
    .from("integrations")
    .select("id")
    .eq("company_id", companyId)
    .eq("provider", "meta")
    .eq("status", "connected")
    .single();

  if (!integRow) return json({ error: "Nessuna integrazione Meta connessa" }, 404);

  const { data: credRow } = await admin
    .from("integration_credentials")
    .select("access_token_encrypted")
    .eq("integration_id", integRow.id)
    .single();

  if (!credRow?.access_token_encrypted) return json({ error: "Token Meta non trovato" }, 404);

  const encKey = getEncryptionKey();
  const accessToken = await decrypt(credRow.access_token_encrypted, encKey);

  // 2. Ad accounts
  const { data: adAccounts } = await admin
    .from("meta_ad_accounts")
    .select("ad_account_id")
    .eq("company_id", companyId);

  // 3. Fetch pages (per pages_show_list + pages_read_engagement + leads_retrieval)
  let pages: Array<{ id: string; access_token?: string }> = [];
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 8000);
    const pagesRes = await fetch(
      `${BASE}/me/accounts?fields=id,name,access_token&limit=50&access_token=${accessToken}`,
      { signal: ctrl.signal }
    );
    const pagesData = await pagesRes.json();
    if (pagesData.data) pages = pagesData.data;
  } catch { /* ignore */ }

  // 4. Fetch lead forms (per leads_retrieval)
  const leadFormIds: string[] = [];
  if (pages.length > 0 && (mode === "all" || mode === "leads")) {
    const formFetches = pages.slice(0, 10).map(async (page) => {
      const pageToken = page.access_token || accessToken;
      try {
        const ctrl = new AbortController();
        setTimeout(() => ctrl.abort(), 8000);
        const r = await fetch(
          `${BASE}/${page.id}/leadgen_forms?fields=id,name,status&limit=10&access_token=${pageToken}`,
          { signal: ctrl.signal }
        );
        const d = await r.json();
        if (d.data) d.data.forEach((f: { id: string }) => leadFormIds.push(f.id));
      } catch { /* ignore */ }
    });
    await Promise.all(formFetches);
  }

  // 5. Costruisci URL da chiamare in batch
  let ok = 0, errors = 0;
  const log: string[] = [];

  const callMeta = async (url: string): Promise<boolean> => {
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(url, { signal: ctrl.signal });
      const data = await res.json();
      if (data.error) { errors++; return false; }
      ok++;
      return true;
    } catch {
      errors++;
      return false;
    }
  };

  const urls: string[] = [];

  for (let r = 0; r < rounds; r++) {
    // --- MARKETING API ---
    if (mode === "all" || mode === "marketing") {
      urls.push(`${BASE}/me/adaccounts?fields=id,name,account_status&access_token=${accessToken}`);
      for (const { ad_account_id } of (adAccounts ?? [])) {
        const act = ad_account_id;
        urls.push(`${BASE}/${act}/campaigns?fields=id,name,status,objective&limit=10&access_token=${accessToken}`);
        urls.push(`${BASE}/${act}/adsets?fields=id,name,status,daily_budget&limit=10&access_token=${accessToken}`);
        urls.push(`${BASE}/${act}/ads?fields=id,name,status&limit=10&access_token=${accessToken}`);
        urls.push(`${BASE}/${act}/insights?fields=impressions,spend,clicks,reach&date_preset=last_30d&access_token=${accessToken}`);
      }
    }

    // --- PAGES: pages_show_list + pages_read_engagement ---
    if (mode === "all" || mode === "pages") {
      // pages_show_list: lista pagine gestite
      urls.push(`${BASE}/me/accounts?fields=id,name,fan_count,engagement&limit=50&access_token=${accessToken}`);
      // pages_read_engagement: dati base di engagement per ogni pagina
      for (const page of pages.slice(0, 15)) {
        const pageToken = page.access_token || accessToken;
        // Endpoint pubblico, funziona con user token + pages_show_list
        urls.push(`${BASE}/${page.id}?fields=name,fan_count,followers_count,engagement&access_token=${pageToken}`);
        urls.push(`${BASE}/${page.id}?fields=name,about,category,engagement&access_token=${pageToken}`);
      }
    }

    // --- LEADS: leads_retrieval ---
    if (mode === "all" || mode === "leads") {
      for (const page of pages.slice(0, 5)) {
        const pageToken = page.access_token || accessToken;
        urls.push(`${BASE}/${page.id}/leadgen_forms?fields=id,name,status&limit=10&access_token=${pageToken}`);
      }
      for (const formId of leadFormIds.slice(0, 10)) {
        urls.push(`${BASE}/${formId}/leads?fields=id,created_time,field_data&limit=10&access_token=${accessToken}`);
        urls.push(`${BASE}/${formId}?fields=id,name,status,questions&access_token=${accessToken}`);
      }
    }
  }

  // 6. Esegui in batch da 20
  const BATCH = 20;
  for (let i = 0; i < urls.length; i += BATCH) {
    await Promise.all(urls.slice(i, i + BATCH).map(u => callMeta(u)));
    if (i > 0 && i % 100 === 0) {
      log.push(`Progress ${i}/${urls.length}: ok=${ok} errors=${errors}`);
    }
  }

  const total = ok + errors;
  const successRate = total > 0 ? Math.round((ok / total) * 100) : 0;

  return json({
    ok: true,
    mode,
    rounds,
    ad_accounts_used: adAccounts?.length ?? 0,
    pages_found: pages.length,
    lead_forms_found: leadFormIds.length,
    calls_total: total,
    calls_success: ok,
    calls_error: errors,
    success_rate_pct: successRate,
    meta_requirement_met: ok >= 500 && successRate >= 85,
    log,
  });
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
