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
// Google ritira ogni versione dell'API dopo circa un anno: la v17 scritta qui
// in origine non risponde più. Si aggiorna con la variabile, senza deploy.
const API_VERSION = Deno.env.get("GOOGLE_ADS_API_VERSION") || "v25";

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
    `https://googleads.googleapis.com/${API_VERSION}/customers/${customerId}/googleAds:searchStream`,
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

    const body = (await req.json().catch(() => ({}))) as {
      company_id?: string; days?: number; action?: string;
      date_start?: string; date_end?: string; prev_start?: string; prev_end?: string; refresh?: boolean;
    };
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
    // Il company_id arriva dal browser: senza questo controllo chiunque avesse
    // un login poteva leggere (o far sincronizzare) le campagne di un'altra azienda.
    if (body.company_id) {
      const { data: puo } = await supabase.rpc("user_can_access_company", { p_company_id: companyId });
      if (puo !== true) {
        return new Response(JSON.stringify({ error: "Accesso negato a questa azienda" }), {
          status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
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

    if (body.action === "report") {
      if (!body.date_start || !body.date_end) {
        return new Response(JSON.stringify({ error: "date_start e date_end obbligatori" }), {
          status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      const payload = await reportConCache(db, {
        companyId, customerId: conn.customer_id, loginCustomerId: conn.manager_customer_id,
        accessToken, developerToken,
        ds: body.date_start, de: body.date_end, ps: body.prev_start, pe: body.prev_end,
        refresh: !!body.refresh,
      });
      return new Response(JSON.stringify(payload), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

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

// ─── Report per livello (action: "report") ──────────────────────────────────
// Campagne → gruppi di annunci → annunci, più parole chiave e termini di
// ricerca, con i totali del periodo e di quello precedente e l'andamento
// giornaliero. Letto in diretta da Google (non da tabelle sincronizzate) e
// tenuto 15 minuti in cache: il developer token "Basic" ha un tetto di
// operazioni giornaliere e ogni report ne consuma una decina.

type Riga = Record<string, unknown>;

interface ReportArgs {
  companyId: string;
  customerId: string;
  loginCustomerId: string | null;
  accessToken: string;
  developerToken: string;
  ds: string;
  de: string;
  ps?: string;
  pe?: string;
  refresh: boolean;
}

// deno-lint-ignore no-explicit-any
const g = (o: any, path: string): any => path.split(".").reduce((v, k) => (v == null ? v : v[k]), o);
const num = (v: unknown) => Number(v ?? 0) || 0;
const euro = (micros: unknown) => num(micros) / 1_000_000;
const quota = (v: unknown) => (v == null ? null : Number(v));

function metriche(r: unknown) {
  return {
    impressions: num(g(r, "metrics.impressions")),
    clicks: num(g(r, "metrics.clicks")),
    spend: euro(g(r, "metrics.costMicros")),
    conversions: num(g(r, "metrics.conversions")),
    conversion_value: num(g(r, "metrics.conversionsValue")),
  };
}

const DATA_OK = /^\d{4}-\d{2}-\d{2}$/;

async function costruisciReport(a: ReportArgs) {
  if (![a.ds, a.de, a.ps ?? a.ds, a.pe ?? a.de].every((d) => DATA_OK.test(d))) {
    throw new Error("Date non valide");
  }
  const periodo = (da: string, a2: string) => `segments.date BETWEEN '${da}' AND '${a2}'`;
  const q = (query: string) =>
    searchStream(a.customerId, query, a.accessToken, a.developerToken, a.loginCustomerId)
      .then((chunks) => chunks.flatMap((c) => (c.results ?? []) as Riga[]));

  const avvisi: string[] = [];
  const contorno = (etichetta: string, p: Promise<Riga[]>) =>
    p.catch((e: Error) => {
      avvisi.push(`${etichetta}: ${e.message.slice(0, 200)}`);
      return [] as Riga[];
    });
  const M = "metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value";

  const [
    campagne, gruppi, annunci, keyword, termini, totale, totalePrec, giornaliero, campagneAttive, gruppiAttivi,
  ] = await Promise.all([
    q(`SELECT campaign.id, campaign.name, campaign.status, campaign.primary_status, campaign.advertising_channel_type,
         campaign.bidding_strategy_type, campaign_budget.amount_micros, ${M},
         metrics.search_impression_share, metrics.search_budget_lost_impression_share, metrics.search_rank_lost_impression_share
       FROM campaign WHERE ${periodo(a.ds, a.de)} AND campaign.status != 'REMOVED'`),
    contorno("gruppi di annunci", q(`SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, ad_group.status, ad_group.type,
         ${M}, metrics.search_impression_share
       FROM ad_group WHERE ${periodo(a.ds, a.de)} AND ad_group.status != 'REMOVED'`)),
    contorno("annunci", q(`SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, ad_group_ad.ad.id, ad_group_ad.ad.name,
         ad_group_ad.ad.type, ad_group_ad.status, ad_group_ad.ad_strength, ad_group_ad.policy_summary.approval_status,
         ad_group_ad.ad.final_urls, ad_group_ad.ad.responsive_search_ad.headlines,
         ad_group_ad.ad.responsive_search_ad.descriptions, ${M}
       FROM ad_group_ad WHERE ${periodo(a.ds, a.de)} AND ad_group_ad.status != 'REMOVED'`)),
    contorno("parole chiave", q(`SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, ad_group_criterion.criterion_id,
         ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status,
         ad_group_criterion.quality_info.quality_score, ${M}, metrics.search_impression_share
       FROM keyword_view WHERE ${periodo(a.ds, a.de)} AND ad_group_criterion.status != 'REMOVED'`)),
    contorno("termini di ricerca", q(`SELECT search_term_view.search_term, search_term_view.status, campaign.id, campaign.name,
         ad_group.id, ad_group.name, ${M}
       FROM search_term_view WHERE ${periodo(a.ds, a.de)}
       ORDER BY metrics.cost_micros DESC LIMIT 300`)),
    q(`SELECT ${M} FROM customer WHERE ${periodo(a.ds, a.de)}`),
    a.ps && a.pe ? contorno("periodo precedente", q(`SELECT ${M} FROM customer WHERE ${periodo(a.ps, a.pe)}`)) : Promise.resolve([]),
    contorno("andamento giornaliero", q(`SELECT segments.date, ${M} FROM customer WHERE ${periodo(a.ds, a.de)}`)),
    contorno("campagne attive", q(`SELECT campaign.id, campaign.name, campaign.status, campaign.primary_status,
         campaign.advertising_channel_type, campaign_budget.amount_micros
       FROM campaign WHERE campaign.status = 'ENABLED'`)),
    contorno("gruppi attivi", q(`SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, ad_group.status
       FROM ad_group WHERE ad_group.status = 'ENABLED' AND campaign.status = 'ENABLED'`)),
  ]);

  const base = (r: Riga) => ({
    campaign_id: String(g(r, "campaign.id") ?? ""),
    campaign_name: g(r, "campaign.name") ?? "",
    ad_group_id: g(r, "adGroup.id") != null ? String(g(r, "adGroup.id")) : null,
    ad_group_name: g(r, "adGroup.name") ?? null,
  });
  const somma = (righe: Riga[]) =>
    righe.reduce<ReturnType<typeof metriche>>((t, r) => {
      const m = metriche(r);
      return {
        impressions: t.impressions + m.impressions,
        clicks: t.clicks + m.clicks,
        spend: t.spend + m.spend,
        conversions: t.conversions + m.conversions,
        conversion_value: t.conversion_value + m.conversion_value,
      };
    }, { impressions: 0, clicks: 0, spend: 0, conversions: 0, conversion_value: 0 });

  return {
    campaigns: campagne.map((r) => ({
      ...base(r),
      id: String(g(r, "campaign.id")),
      name: g(r, "campaign.name"),
      status: g(r, "campaign.status"),
      primary_status: g(r, "campaign.primaryStatus") ?? null,
      channel: g(r, "campaign.advertisingChannelType") ?? null,
      bidding: g(r, "campaign.biddingStrategyType") ?? null,
      budget_daily: g(r, "campaignBudget.amountMicros") ? euro(g(r, "campaignBudget.amountMicros")) : null,
      search_is: quota(g(r, "metrics.searchImpressionShare")),
      lost_budget_is: quota(g(r, "metrics.searchBudgetLostImpressionShare")),
      lost_rank_is: quota(g(r, "metrics.searchRankLostImpressionShare")),
      ...metriche(r),
    })),
    ad_groups: gruppi.map((r) => ({
      ...base(r),
      id: String(g(r, "adGroup.id")),
      name: g(r, "adGroup.name"),
      status: g(r, "adGroup.status"),
      search_is: quota(g(r, "metrics.searchImpressionShare")),
      ...metriche(r),
    })),
    ads: annunci.map((r) => ({
      ...base(r),
      id: String(g(r, "adGroupAd.ad.id")),
      name: g(r, "adGroupAd.ad.name") ?? null,
      status: g(r, "adGroupAd.status"),
      ad_type: g(r, "adGroupAd.ad.type") ?? null,
      ad_strength: g(r, "adGroupAd.adStrength") ?? null,
      approval: g(r, "adGroupAd.policySummary.approvalStatus") ?? null,
      final_url: (g(r, "adGroupAd.ad.finalUrls") ?? [])[0] ?? null,
      headlines: ((g(r, "adGroupAd.ad.responsiveSearchAd.headlines") ?? []) as Array<{ text?: string }>).map((h) => h.text).filter(Boolean),
      descriptions: ((g(r, "adGroupAd.ad.responsiveSearchAd.descriptions") ?? []) as Array<{ text?: string }>).map((h) => h.text).filter(Boolean),
      ...metriche(r),
    })),
    keywords: keyword.map((r) => ({
      ...base(r),
      id: `${g(r, "adGroup.id")}~${g(r, "adGroupCriterion.criterionId")}`,
      name: g(r, "adGroupCriterion.keyword.text"),
      status: g(r, "adGroupCriterion.status"),
      match_type: g(r, "adGroupCriterion.keyword.matchType") ?? null,
      quality_score: g(r, "adGroupCriterion.qualityInfo.qualityScore") ?? null,
      search_is: quota(g(r, "metrics.searchImpressionShare")),
      ...metriche(r),
    })),
    search_terms: termini.map((r) => ({
      ...base(r),
      id: `${g(r, "adGroup.id")}~${g(r, "searchTermView.searchTerm")}`,
      name: g(r, "searchTermView.searchTerm"),
      status: g(r, "searchTermView.status") ?? null,
      ...metriche(r),
    })),
    active_campaigns: campagneAttive.map((r) => ({
      id: String(g(r, "campaign.id")),
      name: g(r, "campaign.name"),
      status: g(r, "campaign.status"),
      primary_status: g(r, "campaign.primaryStatus") ?? null,
      channel: g(r, "campaign.advertisingChannelType") ?? null,
      budget_daily: g(r, "campaignBudget.amountMicros") ? euro(g(r, "campaignBudget.amountMicros")) : null,
    })),
    active_ad_groups: gruppiAttivi.map((r) => ({ ...base(r), id: String(g(r, "adGroup.id")), name: g(r, "adGroup.name"), status: g(r, "adGroup.status") })),
    account: somma(totale),
    account_prev: totalePrec.length ? somma(totalePrec) : null,
    daily: giornaliero
      .map((r) => ({ date: g(r, "segments.date"), ...metriche(r) }))
      .sort((x, y) => String(x.date).localeCompare(String(y.date))),
    avvisi,
    fetched_at: new Date().toISOString(),
  };
}

// La cache riusa meta_insights_cache (è una cache per azienda+account+periodo,
// il nome è storico): chiave "google:<customer>" e livello dedicato.
async function reportConCache(db: ReturnType<typeof admin>, a: ReportArgs) {
  const chiave = `google:${a.customerId}`;
  const livello = "google_report_v1";
  if (!a.refresh) {
    const { data: hit } = await db
      .from("meta_insights_cache")
      .select("payload_json")
      .eq("company_id", a.companyId)
      .eq("ad_account_id", chiave)
      .eq("date_start", a.ds)
      .eq("date_end", a.de)
      .eq("level", livello)
      .gte("expires_at", new Date().toISOString())
      .maybeSingle();
    if (hit) return { ...(hit.payload_json as Record<string, unknown>), from_cache: true };
  }
  const payload = await costruisciReport(a);
  if (payload.avvisi.length === 0) {
    await db.from("meta_insights_cache").upsert({
      company_id: a.companyId,
      ad_account_id: chiave,
      date_start: a.ds,
      date_end: a.de,
      level: livello,
      payload_json: payload,
      fetched_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }, { onConflict: "company_id,ad_account_id,date_start,date_end,level" });
  }
  return { ...payload, from_cache: false };
}
