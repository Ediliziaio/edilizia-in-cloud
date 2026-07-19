// supabase/functions/meta-ads-sync-insights/index.ts
//
// Pull periodico degli insights Meta verso meta_insights_cache.
// Esecuzione:
//   • Manualmente via POST con company_id (UI "Aggiorna ora")
//   • Schedulato via pg_cron ogni 4h con ALL companies
//
// FETCH:
//   GET /act_X/insights?level=campaign&date_preset=last_30d&fields=spend,impressions,clicks,cpm,cpc,ctr,reach,frequency,actions,cost_per_action_type
//   • level=campaign (poi adset / ad in iterazioni successive)
//   • Time breakdown: daily (per grafico) o aggregated 30d (per KPI)
//
// SCRITTURA:
//   • meta_insights_cache (1 riga per campaign × giorno × level)
//   • Se la tabella non esiste, fallback: skip e log warning

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decrypt, getEncryptionKey } from "../_shared/encryption.ts";
import { getCorsHeaders } from "../_shared/headers.ts";

const apiVersion = Deno.env.get("META_API_VERSION") || "v21.0";

interface SyncInsightsRequest {
  /** Sync per una company specifica. Se omesso e service_role caller → tutte le active. */
  company_id?: string;
  /** Force = ignora last_synced_at e rifai sync completo */
  force?: boolean;
}

interface SyncResult {
  companies_processed: number;
  campaigns_synced: number;
  insights_rows_written: number;
  errors: string[];
  duration_ms: number;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, corsHeaders);

  const t0 = Date.now();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    // Auth: service_role, x-cron-secret (pg_cron, come gli altri worker meta-*)
    // o bearer user con company_admin
    const authHeader = req.headers.get("Authorization");
    const cronSecret = Deno.env.get("CRON_SECRET");
    const viaCron = !!cronSecret && req.headers.get("x-cron-secret") === cronSecret;
    const isServiceRole = viaCron || authHeader === `Bearer ${serviceKey}`;
    let userCompanyId: string | undefined;

    if (!isServiceRole) {
      if (!authHeader?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401, corsHeaders);
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser(authHeader.replace("Bearer ", ""));
      if (!user) return json({ error: "unauthorized" }, 401, corsHeaders);
      const { data: profile } = await admin
        .from("profiles")
        .select("company_id")
        .eq("id", user.id)
        .maybeSingle();
      userCompanyId = profile?.company_id;
    }

    let body: SyncInsightsRequest = {};
    try {
      body = (await req.json()) as SyncInsightsRequest;
    } catch {
      body = {};
    }

    // Determina companies da processare
    let companies: { company_id: string; integration_id: string; ad_account_id: string; meta_act_id: string; token_encrypted: string }[] = [];

    const filterCompanyId = isServiceRole ? body.company_id : (userCompanyId ?? body.company_id);

    // FIX COLLEGAMENTO: la vecchia query usava l'embed `integrations!inner(access_token_encrypted)`
    // ma (1) non esiste una FK meta_ad_accounts→integrations (PostgREST: "Could not find a
    // relationship") e (2) il token NON sta su `integrations` bensì su `integration_credentials`
    // (stessa fonte di meta-api-proxy). Risultato: il sync cron-wide non era MAI partito.
    const accountsQuery = admin
      .from("meta_ad_accounts")
      .select("id, company_id, integration_id, ad_account_id");
    if (filterCompanyId) accountsQuery.eq("company_id", filterCompanyId);
    const { data: accounts, error: accountsErr } = await accountsQuery;
    if (accountsErr) {
      return json({ error: "accounts_fetch_failed", detail: String(accountsErr.message) }, 500, corsHeaders);
    }

    const integrationIds = [...new Set((accounts ?? []).map((a) => a.integration_id).filter(Boolean))];
    const [integrationsRes, credsRes] = await Promise.all([
      integrationIds.length
        ? admin.from("integrations").select("id, status").in("id", integrationIds).eq("status", "connected")
        : Promise.resolve({ data: [] as { id: string; status: string }[] }),
      integrationIds.length
        ? admin.from("integration_credentials").select("integration_id, access_token_encrypted").in("integration_id", integrationIds)
        : Promise.resolve({ data: [] as { integration_id: string; access_token_encrypted: string }[] }),
    ]);
    const connected = new Set((integrationsRes.data ?? []).map((i) => i.id));
    const tokenByIntegration = new Map(
      (credsRes.data ?? []).map((c) => [c.integration_id, c.access_token_encrypted]),
    );

    companies = (accounts ?? [])
      .filter((a) => connected.has(a.integration_id) && tokenByIntegration.get(a.integration_id))
      .map((a) => ({
        company_id: a.company_id,
        integration_id: a.integration_id,
        ad_account_id: a.id,
        meta_act_id: a.ad_account_id.startsWith("act_") ? a.ad_account_id : `act_${a.ad_account_id}`,
        token_encrypted: tokenByIntegration.get(a.integration_id)!,
      }));

    const encKey = await getEncryptionKey();
    const errors: string[] = [];
    let campaignsSynced = 0;
    let insightsRows = 0;

    for (const c of companies) {
      try {
        const accessToken = await decrypt(c.token_encrypted, encKey);

        // Lista campagne attive/recenti
        const { data: localCampaigns } = await admin
          .from("meta_campaigns")
          .select("id, meta_campaign_id")
          .eq("company_id", c.company_id)
          .not("meta_campaign_id", "is", null)
          .in("status", ["active", "paused", "published"]);

        for (const lc of localCampaigns ?? []) {
          const insightFields = [
            "campaign_id",
            "campaign_name",
            "spend",
            "impressions",
            "clicks",
            "cpm",
            "cpc",
            "ctr",
            "reach",
            "frequency",
            "actions",
            "cost_per_action_type",
          ].join(",");

          const url = `https://graph.facebook.com/${apiVersion}/${lc.meta_campaign_id}/insights?fields=${insightFields}&date_preset=last_30d&time_increment=1&access_token=${accessToken}`;
          const resp = await fetch(url);
          if (!resp.ok) {
            errors.push(`campaign_${lc.meta_campaign_id}_insights_failed`);
            continue;
          }
          const j = await resp.json() as { data?: MetaInsightAPI[] };
          const rows = j.data ?? [];

          for (const row of rows) {
            const leadAction = (row.actions ?? []).find(
              (a) => a.action_type === "lead" || a.action_type === "leadgen.other",
            );
            const leadCpa = (row.cost_per_action_type ?? []).find(
              (a) => a.action_type === "lead" || a.action_type === "leadgen.other",
            );

            const today = new Date().toISOString().split("T")[0];
            const insightRow = {
              company_id: c.company_id,
              // ad_account_id e' text NOT NULL: senza questo campo OGNI upsert
              // campaign-daily falliva la NOT-NULL e finiva muto in errors[]
              // (il cron restituiva comunque 200 → zero righe scritte).
              // ⚠️ COLLISIONE INDICE: valorizzando ad_account_id, l'indice unico
              // meta_insights_cache_company_id_ad_account_id_date_start_dat_key
              // (company_id, ad_account_id, date_start, date_stop) diventa
              // condiviso da TUTTE le campagne dello stesso account/giorno.
              // L'upsert qui fa onConflict sulla campaign_daily key, quindi la
              // 2ª campagna/giorno viola QUEST'ALTRO indice e ricade in errors[].
              // Da risolvere a livello schema (es. indice parziale su level), NON
              // qui.
              ad_account_id: c.meta_act_id,
              campaign_id: lc.id,
              // Sentinel uuid-zero (le colonne sono uuid NOT NULL e fanno
              // parte della chiave unica meta_insights_cache_campaign_daily_key:
              // i NULL non collidono mai in un indice unico → niente dedupe).
              adset_id: "00000000-0000-0000-0000-000000000000",
              ad_id: "00000000-0000-0000-0000-000000000000",
              level: "campaign",
              date_start: row.date_start ?? today,
              date_stop: row.date_stop ?? today,
              // date_end e' NOT NULL senza default (usata dall'api-proxy):
              // senza questo campo l'insert falliva in silenzio → il sync
              // non ha MAI scritto una riga di insights.
              date_end: row.date_stop ?? today,
              spend_cents: Math.round(parseFloat(row.spend ?? "0") * 100),
              impressions: parseInt(row.impressions ?? "0", 10),
              clicks: parseInt(row.clicks ?? "0", 10),
              cpm_cents: Math.round(parseFloat(row.cpm ?? "0") * 100),
              cpc_cents: Math.round(parseFloat(row.cpc ?? "0") * 100),
              ctr: parseFloat(row.ctr ?? "0"),
              reach: parseInt(row.reach ?? "0", 10),
              frequency: parseFloat(row.frequency ?? "0"),
              leads: parseInt(leadAction?.value ?? "0", 10),
              cost_per_lead_cents: leadCpa?.value
                ? Math.round(parseFloat(leadCpa.value) * 100)
                : 0,
              raw: row,
            };

            // onConflict allineato all'indice unico
            // meta_insights_cache_campaign_daily_key (prima puntava a colonne
            // SENZA constraint → 42P10 a ogni upsert, e il fallback insert
            // falliva muto per date_end NOT NULL: zero righe scritte).
            const { error: upsertErr } = await admin
              .from("meta_insights_cache")
              .upsert(insightRow, { onConflict: "company_id,campaign_id,adset_id,ad_id,date_start,date_stop" });
            if (upsertErr) {
              const msg = String(upsertErr.message ?? "");
              if (msg.includes("does not exist") || msg.includes("schema cache")) {
                errors.push("schema_not_applied");
                // Stop intero processing per quella company
                break;
              }
              errors.push(`insight_upsert:${msg.substring(0, 100)}`);
            } else {
              insightsRows += 1;
            }
          }
          campaignsSynced += 1;

          // Aggiorna last_synced sulla campaign
          await admin
            .from("meta_campaigns")
            .update({ last_synced_at: new Date().toISOString() })
            .eq("id", lc.id);
        }
      } catch (e) {
        errors.push(`company_${c.company_id}_failed:${String(e)}`);
      }
    }

    const result: SyncResult = {
      companies_processed: companies.length,
      campaigns_synced: campaignsSynced,
      insights_rows_written: insightsRows,
      errors,
      duration_ms: Date.now() - t0,
    };

    return json(result, 200, corsHeaders);
  } catch (e) {
    console.error("[meta-ads-sync-insights] uncaught", e);
    return json({ error: "internal_error", detail: String(e) }, 500, corsHeaders);
  }
});

interface MetaInsightAPI {
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  cpm?: string;
  cpc?: string;
  ctr?: string;
  reach?: string;
  frequency?: string;
  date_start?: string;
  date_stop?: string;
  actions?: Array<{ action_type: string; value: string }>;
  cost_per_action_type?: Array<{ action_type: string; value: string }>;
}

function json(payload: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
