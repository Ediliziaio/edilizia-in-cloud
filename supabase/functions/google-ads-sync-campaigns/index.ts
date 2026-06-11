/**
 * google-ads-sync-campaigns — sincronizza campagne + insights 30gg
 *
 * POST /functions/v1/google-ads-sync-campaigns
 * Body: { company_id?: string, days?: number }  (default days=30)
 *
 * Esegue 2 query GAQL:
 *   1. campaign (struttura + budget)
 *   2. campaign + segments + metrics (insights aggregati last N days)
 *
 * Refresh access_token automatico.
 * Richiede google_ads_developer_token approvato Google.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
import { getEncryptionKey, encrypt, decrypt } from "../_shared/encryption.ts";
import { getCorsHeaders } from "../_shared/headers.ts";

const TOKEN_URL = "https://oauth2.googleapis.com/token";

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function getFreshAccessToken(connectionId: string): Promise<string> {
  const db = admin();
  const { data: conn } = await db
    .from("google_ads_connections")
    .select("access_token_encrypted, refresh_token_encrypted, token_expires_at")
    .eq("id", connectionId)
    .maybeSingle();
  if (!conn) throw new Error("Connection not found");

  const encKey = getEncryptionKey();
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  if (Date.now() < expiresAt - 60_000 && conn.access_token_encrypted) {
    return await decrypt(conn.access_token_encrypted, encKey);
  }
  if (!conn.refresh_token_encrypted) throw new Error("No refresh token");

  const clientId = await getPlatformSetting("google_ads_client_id", "GOOGLE_ADS_CLIENT_ID");
  const clientSecret = await getPlatformSetting("google_ads_client_secret", "GOOGLE_ADS_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("OAuth credentials missing");

  const refreshToken = await decrypt(conn.refresh_token_encrypted, encKey);
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`refresh failed: ${await res.text()}`);
  const tokens = await res.json() as { access_token: string; expires_in: number };

  await db.from("google_ads_connections").update({
    access_token_encrypted: await encrypt(tokens.access_token, encKey),
    token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
  }).eq("id", connectionId);

  return tokens.access_token;
}

async function searchStream(
  customerId: string,
  query: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string | null,
): Promise<Array<{ results?: unknown[] }>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": developerToken,
    "Content-Type": "application/json",
  };
  if (loginCustomerId) headers["login-customer-id"] = loginCustomerId;

  const res = await fetch(
    `https://googleads.googleapis.com/v17/customers/${customerId}/googleAds:searchStream`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!res.ok) {
    throw new Error(`GAQL ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return await res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const body = (await req.json().catch(() => ({}))) as { company_id?: string; days?: number };
    const days = Math.max(1, Math.min(365, body.days ?? 30));

    const db = admin();
    let companyId = body.company_id;
    if (!companyId) {
      const { data: profile } = await db.from("profiles").select("company_id").eq("id", user.id).maybeSingle();
      companyId = profile?.company_id ?? undefined;
    }
    if (!companyId) {
      return new Response(JSON.stringify({ error: "Company not found" }), {
        status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const { data: conn } = await db
      .from("google_ads_connections")
      .select("id, customer_id, manager_customer_id")
      .eq("company_id", companyId)
      .maybeSingle();
    if (!conn || !conn.customer_id) {
      return new Response(JSON.stringify({ error: "Google Ads non collegato o customer non selezionato" }), {
        status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const developerToken = await getPlatformSetting("google_ads_developer_token", "GOOGLE_ADS_DEVELOPER_TOKEN");
    if (!developerToken) {
      return new Response(JSON.stringify({ error: "GOOGLE_ADS_DEVELOPER_TOKEN non configurato" }), {
        status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const accessToken = await getFreshAccessToken(conn.id);

    // Query 1: campagne (struttura + budget)
    const campaignsQuery = `
      SELECT
        campaign.id, campaign.name, campaign.status,
        campaign.advertising_channel_type, campaign.bidding_strategy_type,
        campaign.start_date, campaign.end_date,
        campaign_budget.amount_micros, campaign_budget.total_amount_micros
      FROM campaign
      WHERE campaign.status != 'REMOVED'
    `;

    interface CampaignRow {
      campaign?: {
        id?: string; name?: string; status?: string;
        advertisingChannelType?: string; biddingStrategyType?: string;
        startDate?: string; endDate?: string;
      };
      campaignBudget?: { amountMicros?: string; totalAmountMicros?: string };
    }

    const campaignsRes = await searchStream(
      conn.customer_id, campaignsQuery,
      accessToken, developerToken, conn.manager_customer_id,
    );
    const campaigns = campaignsRes.flatMap((chunk) => (chunk.results ?? []) as CampaignRow[]);

    // Query 2: insights last N days
    const insightsQuery = `
      SELECT
        campaign.id,
        metrics.impressions, metrics.clicks, metrics.cost_micros,
        metrics.conversions, metrics.conversions_value
      FROM campaign
      WHERE segments.date DURING LAST_${days}_DAYS
    `;

    interface InsightsRow {
      campaign?: { id?: string };
      metrics?: {
        impressions?: string; clicks?: string; costMicros?: string;
        conversions?: number; conversionsValue?: number;
      };
    }

    let insightsByCampaign = new Map<string, {
      impressions: bigint; clicks: bigint; costMicros: bigint;
      conversions: number; conversionsValue: number;
    }>();

    try {
      const insightsRes = await searchStream(
        conn.customer_id,
        insightsQuery.replace(`LAST_${days}_DAYS`, days === 7 ? "LAST_7_DAYS" : days === 14 ? "LAST_14_DAYS" : "LAST_30_DAYS"),
        accessToken, developerToken, conn.manager_customer_id,
      );
      const insightsRows = insightsRes.flatMap((chunk) => (chunk.results ?? []) as InsightsRow[]);
      // Aggrega per campaign.id (la query non ha GROUP BY: Google aggrega per default su tutti i segments)
      for (const r of insightsRows) {
        const id = r.campaign?.id;
        if (!id) continue;
        const current = insightsByCampaign.get(id) ?? {
          impressions: 0n, clicks: 0n, costMicros: 0n, conversions: 0, conversionsValue: 0,
        };
        current.impressions += BigInt(r.metrics?.impressions ?? 0);
        current.clicks += BigInt(r.metrics?.clicks ?? 0);
        current.costMicros += BigInt(r.metrics?.costMicros ?? 0);
        current.conversions += r.metrics?.conversions ?? 0;
        current.conversionsValue += r.metrics?.conversionsValue ?? 0;
        insightsByCampaign.set(id, current);
      }
    } catch (e) {
      console.warn("[google-ads-sync-campaigns] insights query failed (non-blocking):", e);
      insightsByCampaign = new Map();
    }

    // Upsert
    if (campaigns.length > 0) {
      const rows = campaigns.map((c) => {
        const camp = c.campaign;
        const budget = c.campaignBudget;
        const ins = camp?.id ? insightsByCampaign.get(camp.id) : undefined;
        return {
          connection_id: conn.id,
          company_id: companyId,
          google_campaign_id: camp?.id ?? "",
          google_customer_id: conn.customer_id,
          name: camp?.name ?? null,
          status: camp?.status ?? null,
          advertising_channel_type: camp?.advertisingChannelType ?? null,
          bidding_strategy_type: camp?.biddingStrategyType ?? null,
          start_date: camp?.startDate ?? null,
          end_date: camp?.endDate ?? null,
          daily_budget_micros: budget?.amountMicros ? Number(budget.amountMicros) : null,
          total_budget_micros: budget?.totalAmountMicros ? Number(budget.totalAmountMicros) : null,
          last30_impressions: ins ? Number(ins.impressions) : 0,
          last30_clicks: ins ? Number(ins.clicks) : 0,
          last30_cost_micros: ins ? Number(ins.costMicros) : 0,
          last30_conversions: ins?.conversions ?? 0,
          last30_conversion_value_micros: ins ? Math.round(ins.conversionsValue * 1_000_000) : 0,
          insights_updated_at: new Date().toISOString(),
          raw: c,
        };
      });

      const { error: upsertErr } = await db.from("google_ads_campaigns").upsert(rows, {
        onConflict: "connection_id,google_campaign_id",
      });
      if (upsertErr) {
        console.error("[google-ads-sync-campaigns] upsert error:", upsertErr);
        throw upsertErr;
      }
    }

    await db.from("google_ads_connections").update({
      last_sync_at: new Date().toISOString(),
      last_sync_campaign_count: campaigns.length,
      last_error: null,
    }).eq("id", conn.id);

    return new Response(JSON.stringify({
      ok: true,
      campaigns: campaigns.length,
      insights_window_days: days,
    }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[google-ads-sync-campaigns] error:", e);
    const msg = (e as Error).message ?? "";
    // Refresh token assente (OAuth senza consenso offline): errore azionabile,
    // non un 500 generico.
    if (msg.includes("No refresh token")) {
      return new Response(JSON.stringify({
        error: "google_reconnect_required",
        detail: "Riconnetti Google Ads dalle Integrazioni: manca il consenso offline (refresh token).",
      }), {
        status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
