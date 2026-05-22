// supabase/functions/meta-ads-list-from-account/index.ts
//
// Sincronizza campagne / ad sets / ads da un Meta Ad Account verso le tabelle
// locali (meta_campaigns / meta_ad_sets / meta_ads). Read-only.
//
// Sicurezza:
//   • Autenticazione via Bearer token (utente loggato)
//   • Validazione company ownership (no cross-tenant)
//   • Service role per scrivere in DB
//
// Pattern fetch Meta API:
//   1. GET /act_{ad_account_id}/campaigns?fields=id,name,objective,status,daily_budget,lifetime_budget,buying_type,special_ad_categories
//   2. GET /act_{ad_account_id}/adsets?fields=id,name,campaign_id,status,daily_budget,optimization_goal,billing_event,targeting,bid_strategy
//   3. GET /act_{ad_account_id}/ads?fields=id,name,adset_id,creative,status,tracking_specs
//   4. Upsert su meta_campaigns / meta_ad_sets / meta_ads usando (company_id, meta_*_id) come PK logica
//
// NB: La migration 20260522150000 deve essere applicata. Se mancano le tabelle,
// la funzione ritorna 503 con messaggio chiaro.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decrypt, getEncryptionKey } from "../_shared/encryption.ts";
import { getCorsHeaders } from "../_shared/headers.ts";

const apiVersion = Deno.env.get("META_API_VERSION") || "v21.0";

interface SyncRequest {
  company_id: string;
  ad_account_id: string; // UUID locale (meta_ad_accounts.id) — non l'act_XXX di Meta
  integration_id?: string;
  /** Se true include anche ads archiviate (status=ARCHIVED) */
  include_archived?: boolean;
}

interface SyncResult {
  success: boolean;
  synced: {
    campaigns: number;
    ad_sets: number;
    ads: number;
  };
  errors: string[];
  duration_ms: number;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405, corsHeaders);
  }

  const t0 = Date.now();

  try {
    // --- AUTH ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "unauthorized" }, 401, corsHeaders);
    }
    const token = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: { user: authUser }, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !authUser) {
      return json({ error: "unauthorized" }, 401, corsHeaders);
    }

    // --- BODY ---
    let body: SyncRequest;
    try {
      body = (await req.json()) as SyncRequest;
    } catch {
      return json({ error: "invalid_json" }, 400, corsHeaders);
    }
    if (!body.company_id || !body.ad_account_id) {
      return json({ error: "company_id_and_ad_account_id_required" }, 400, corsHeaders);
    }

    // --- AUTHZ: company ownership ---
    const [profileRes, rolesRes] = await Promise.all([
      admin.from("profiles").select("company_id").eq("id", authUser.id).maybeSingle(),
      admin.from("user_roles").select("role").eq("user_id", authUser.id),
    ]);
    const isSuperAdmin = (rolesRes.data ?? []).some((r) => r.role === "super_admin");
    if (!isSuperAdmin && profileRes.data?.company_id !== body.company_id) {
      console.warn("[meta-ads-list-from-account] cross-tenant attempt", {
        user: authUser.id,
        company: body.company_id,
      });
      return json({ error: "forbidden" }, 403, corsHeaders);
    }

    // --- LOAD AD ACCOUNT + INTEGRATION ---
    const { data: adAccount, error: adAccountErr } = await admin
      .from("meta_ad_accounts")
      .select("ad_account_id, integration_id, ad_account_name")
      .eq("id", body.ad_account_id)
      .eq("company_id", body.company_id)
      .maybeSingle();

    if (adAccountErr || !adAccount) {
      return json({ error: "ad_account_not_found" }, 404, corsHeaders);
    }

    // --- LOAD ACCESS TOKEN ---
    const { data: integration, error: integErr } = await admin
      .from("integrations")
      .select("access_token_encrypted, status")
      .eq("id", adAccount.integration_id)
      .eq("company_id", body.company_id)
      .maybeSingle();
    if (integErr || !integration?.access_token_encrypted) {
      return json({ error: "integration_token_missing" }, 400, corsHeaders);
    }
    if (integration.status !== "connected") {
      return json({ error: "integration_not_connected" }, 400, corsHeaders);
    }

    const encKey = await getEncryptionKey();
    const accessToken = await decrypt(integration.access_token_encrypted, encKey);

    // --- FETCH CAMPAIGNS ---
    const errors: string[] = [];
    const metaActId = adAccount.ad_account_id.startsWith("act_")
      ? adAccount.ad_account_id
      : `act_${adAccount.ad_account_id}`;

    const campaignFields = [
      "id",
      "name",
      "objective",
      "status",
      "daily_budget",
      "lifetime_budget",
      "buying_type",
      "special_ad_categories",
      "special_ad_category_country",
      "start_time",
      "stop_time",
      "created_time",
      "updated_time",
    ].join(",");

    const statusFilter = body.include_archived
      ? ""
      : "&filtering=" + encodeURIComponent(JSON.stringify([{ field: "status", operator: "NOT_IN", value: ["ARCHIVED", "DELETED"] }]));

    const campaignsUrl = `https://graph.facebook.com/${apiVersion}/${metaActId}/campaigns?fields=${campaignFields}&limit=200${statusFilter}&access_token=${accessToken}`;
    const campaignsResp = await fetch(campaignsUrl);
    if (!campaignsResp.ok) {
      const text = await campaignsResp.text();
      console.error("[meta-ads-list-from-account] campaigns fetch failed", text);
      return json({ error: "meta_api_error", detail: text.substring(0, 500) }, 502, corsHeaders);
    }
    const campaignsJson = (await campaignsResp.json()) as { data?: MetaCampaignAPI[] };
    const campaigns = campaignsJson.data ?? [];

    // --- FETCH AD SETS ---
    const adSetFields = [
      "id",
      "name",
      "campaign_id",
      "status",
      "daily_budget",
      "lifetime_budget",
      "optimization_goal",
      "billing_event",
      "bid_strategy",
      "bid_amount",
      "targeting",
      "promoted_object",
      "start_time",
      "end_time",
    ].join(",");
    const adSetsUrl = `https://graph.facebook.com/${apiVersion}/${metaActId}/adsets?fields=${adSetFields}&limit=200${statusFilter}&access_token=${accessToken}`;
    const adSetsResp = await fetch(adSetsUrl);
    const adSetsJson = adSetsResp.ok
      ? ((await adSetsResp.json()) as { data?: MetaAdSetAPI[] })
      : { data: [] };
    if (!adSetsResp.ok) errors.push("ad_sets_fetch_failed");
    const adSets = adSetsJson.data ?? [];

    // --- FETCH ADS ---
    const adFields = [
      "id",
      "name",
      "adset_id",
      "creative",
      "status",
      "tracking_specs",
      "conversion_specs",
    ].join(",");
    const adsUrl = `https://graph.facebook.com/${apiVersion}/${metaActId}/ads?fields=${adFields}&limit=500${statusFilter}&access_token=${accessToken}`;
    const adsResp = await fetch(adsUrl);
    const adsJson = adsResp.ok ? ((await adsResp.json()) as { data?: MetaAdAPI[] }) : { data: [] };
    if (!adsResp.ok) errors.push("ads_fetch_failed");
    const ads = adsJson.data ?? [];

    // --- UPSERT CAMPAIGNS ---
    let syncedCampaigns = 0;
    for (const c of campaigns) {
      try {
        const payload = {
          company_id: body.company_id,
          integration_id: adAccount.integration_id,
          ad_account_id: body.ad_account_id,
          meta_campaign_id: c.id,
          name: c.name,
          objective: c.objective,
          status: mapMetaStatusToLocal(c.status),
          buying_type: c.buying_type ?? "AUCTION",
          budget_mode: c.daily_budget ? "campaign" : "adset",
          daily_budget_cents: c.daily_budget ? parseInt(c.daily_budget, 10) : null,
          lifetime_budget_cents: c.lifetime_budget ? parseInt(c.lifetime_budget, 10) : null,
          special_ad_categories: c.special_ad_categories ?? [],
          special_ad_category_country: c.special_ad_category_country ?? null,
          start_time: c.start_time ?? null,
          stop_time: c.stop_time ?? null,
          raw: c,
          last_synced_at: new Date().toISOString(),
        };

        const { error } = await admin
          .from("meta_campaigns")
          .upsert(payload, { onConflict: "company_id,meta_campaign_id" });
        if (error) {
          const msg = String(error.message ?? error);
          if (msg.includes("does not exist") || msg.includes("schema cache")) {
            return json({
              error: "schema_not_applied",
              detail: "La migration 20260522150000_meta_ads_campaign_management non è stata applicata. Esegui supabase db push.",
            }, 503, corsHeaders);
          }
          errors.push(`campaign_upsert:${c.id}:${msg}`);
        } else {
          syncedCampaigns += 1;
        }
      } catch (e) {
        errors.push(`campaign_upsert_exception:${c.id}:${String(e)}`);
      }
    }

    // --- UPSERT AD SETS ---
    // Serve mappare meta_campaign_id → campaign_id locale (UUID)
    const { data: localCampaigns } = await admin
      .from("meta_campaigns")
      .select("id, meta_campaign_id")
      .eq("company_id", body.company_id)
      .not("meta_campaign_id", "is", null);
    const campaignIdMap = new Map<string, string>();
    for (const lc of localCampaigns ?? []) {
      if (lc.meta_campaign_id) campaignIdMap.set(lc.meta_campaign_id, lc.id);
    }

    let syncedAdSets = 0;
    for (const a of adSets) {
      const localCampaignId = campaignIdMap.get(a.campaign_id);
      if (!localCampaignId) {
        errors.push(`adset_orphan:${a.id}`);
        continue;
      }
      try {
        const payload = {
          company_id: body.company_id,
          campaign_id: localCampaignId,
          meta_adset_id: a.id,
          name: a.name,
          status: mapMetaStatusToLocal(a.status),
          daily_budget_cents: a.daily_budget ? parseInt(a.daily_budget, 10) : null,
          lifetime_budget_cents: a.lifetime_budget ? parseInt(a.lifetime_budget, 10) : null,
          bid_amount_cents: a.bid_amount ? parseInt(a.bid_amount, 10) : null,
          optimization_goal: a.optimization_goal ?? null,
          billing_event: a.billing_event ?? null,
          bid_strategy: a.bid_strategy ?? null,
          targeting: a.targeting ?? {},
          promoted_object: a.promoted_object ?? null,
          start_time: a.start_time ?? null,
          end_time: a.end_time ?? null,
          raw: a,
          last_synced_at: new Date().toISOString(),
        };
        const { error } = await admin
          .from("meta_ad_sets")
          .upsert(payload, { onConflict: "company_id,meta_adset_id" });
        if (error) errors.push(`adset_upsert:${a.id}:${String(error.message)}`);
        else syncedAdSets += 1;
      } catch (e) {
        errors.push(`adset_exception:${a.id}:${String(e)}`);
      }
    }

    // --- UPSERT ADS (semplificato: solo metadata, no creatives) ---
    const { data: localAdSets } = await admin
      .from("meta_ad_sets")
      .select("id, meta_adset_id")
      .eq("company_id", body.company_id)
      .not("meta_adset_id", "is", null);
    const adSetIdMap = new Map<string, string>();
    for (const las of localAdSets ?? []) {
      if (las.meta_adset_id) adSetIdMap.set(las.meta_adset_id, las.id);
    }

    let syncedAds = 0;
    for (const a of ads) {
      const localAdSetId = adSetIdMap.get(a.adset_id);
      if (!localAdSetId) {
        errors.push(`ad_orphan:${a.id}`);
        continue;
      }

      // Cerca o crea creative locale stub
      const metaCreativeId = a.creative?.id ?? null;
      if (!metaCreativeId) {
        errors.push(`ad_no_creative:${a.id}`);
        continue;
      }

      let localCreativeId: string | null = null;
      const { data: existingCreative } = await admin
        .from("meta_creatives")
        .select("id")
        .eq("company_id", body.company_id)
        .eq("meta_creative_id", metaCreativeId)
        .maybeSingle();

      if (existingCreative) {
        localCreativeId = existingCreative.id;
      } else {
        const { data: newCreative } = await admin
          .from("meta_creatives")
          .insert({
            company_id: body.company_id,
            meta_creative_id: metaCreativeId,
            name: a.name + " — creative",
            format: "image",
            last_synced_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        localCreativeId = newCreative?.id ?? null;
      }

      if (!localCreativeId) {
        errors.push(`ad_creative_create_failed:${a.id}`);
        continue;
      }

      try {
        const payload = {
          company_id: body.company_id,
          adset_id: localAdSetId,
          creative_id: localCreativeId,
          meta_ad_id: a.id,
          name: a.name,
          status: mapMetaStatusToLocal(a.status),
          tracking_specs: a.tracking_specs ?? [],
          conversion_specs: a.conversion_specs ?? [],
          raw: a,
          last_synced_at: new Date().toISOString(),
        };
        const { error } = await admin
          .from("meta_ads")
          .upsert(payload, { onConflict: "company_id,meta_ad_id" });
        if (error) errors.push(`ad_upsert:${a.id}:${String(error.message)}`);
        else syncedAds += 1;
      } catch (e) {
        errors.push(`ad_exception:${a.id}:${String(e)}`);
      }
    }

    // --- AGGIORNA last_sync_at sull'integrazione ---
    await admin
      .from("integrations")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("id", adAccount.integration_id);

    const result: SyncResult = {
      success: errors.length === 0,
      synced: {
        campaigns: syncedCampaigns,
        ad_sets: syncedAdSets,
        ads: syncedAds,
      },
      errors,
      duration_ms: Date.now() - t0,
    };

    return json(result, 200, corsHeaders);
  } catch (e) {
    console.error("[meta-ads-list-from-account] uncaught", e);
    return json({ error: "internal_error", detail: String(e) }, 500, corsHeaders);
  }
});

function json(payload: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Mappa lo status Meta (ACTIVE/PAUSED/ARCHIVED/DELETED/etc.) al nostro enum locale.
 */
function mapMetaStatusToLocal(metaStatus: string): string {
  switch ((metaStatus || "").toUpperCase()) {
    case "ACTIVE":
      return "active";
    case "PAUSED":
      return "paused";
    case "ARCHIVED":
      return "archived";
    case "DELETED":
      return "archived";
    case "PENDING_REVIEW":
    case "IN_PROCESS":
      return "review";
    case "DISAPPROVED":
      return "error";
    case "PREAPPROVED":
    case "WITH_ISSUES":
      return "published";
    default:
      return "published";
  }
}

/* ----------------------- Tipi Meta API ----------------------- */

interface MetaCampaignAPI {
  id: string;
  name: string;
  objective: string;
  status: string;
  buying_type?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  special_ad_categories?: string[];
  special_ad_category_country?: string;
  start_time?: string;
  stop_time?: string;
}

interface MetaAdSetAPI {
  id: string;
  name: string;
  campaign_id: string;
  status: string;
  daily_budget?: string;
  lifetime_budget?: string;
  bid_amount?: string;
  optimization_goal?: string;
  billing_event?: string;
  bid_strategy?: string;
  targeting?: Record<string, unknown>;
  promoted_object?: Record<string, unknown>;
  start_time?: string;
  end_time?: string;
}

interface MetaAdAPI {
  id: string;
  name: string;
  adset_id: string;
  status: string;
  creative?: { id: string };
  tracking_specs?: Record<string, unknown>[];
  conversion_specs?: Record<string, unknown>[];
}
