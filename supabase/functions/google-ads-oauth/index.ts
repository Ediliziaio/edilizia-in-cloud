/**
 * google-ads-oauth — OAuth flow Google Ads API
 *
 * Endpoints:
 *   POST  /functions/v1/google-ads-oauth?action=start       → { url }
 *   GET   /functions/v1/google-ads-oauth?action=callback    → HTML postMessage
 *   POST  /functions/v1/google-ads-oauth?action=select_customer
 *           body: { connection_id, customer_id, manager_customer_id? }
 *   POST  /functions/v1/google-ads-oauth?action=disconnect
 *
 * Scope: https://www.googleapis.com/auth/adwords
 * Secrets:
 *   google_ads_client_id / GOOGLE_ADS_CLIENT_ID
 *   google_ads_client_secret / GOOGLE_ADS_CLIENT_SECRET
 *   google_ads_developer_token / GOOGLE_ADS_DEVELOPER_TOKEN (per le API calls)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
import { getEncryptionKey, encrypt } from "../_shared/encryption.ts";
import { getCorsHeaders } from "../_shared/headers.ts";

// 2026-05-27: aggiunto "openid email profile" — senza questi scope il chiamata
// a oauth2/v2/userinfo ritorna {} e google_account_email finisce a null in DB.
const SCOPE = "https://www.googleapis.com/auth/adwords openid email profile";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function getRedirectUri() {
  return `${Deno.env.get("SUPABASE_URL")!}/functions/v1/google-ads-oauth?action=callback`;
}

async function getCredentials() {
  return {
    clientId: await getPlatformSetting("google_ads_client_id", "GOOGLE_ADS_CLIENT_ID"),
    clientSecret: await getPlatformSetting("google_ads_client_secret", "GOOGLE_ADS_CLIENT_SECRET"),
    developerToken: await getPlatformSetting("google_ads_developer_token", "GOOGLE_ADS_DEVELOPER_TOKEN"),
  };
}

/**
 * 2026-05-27 (fix bug bloccante segnalato dall'utente):
 *
 * Stesso problema di gbp-oauth: il gateway Supabase forza Content-Type:text/plain
 * + CSP:sandbox su edge function verify_jwt=false → lo script inline
 * `window.opener.postMessage` veniva bloccato dal CSP → popup mostrava HTML
 * grezzo, parent restava in "Connessione in corso..." per sempre.
 *
 * FIX: redirect 302 a `/azienda/impostazioni/integrazioni/google-ads-callback`
 * (pagina React su Cloudflare Pages che fa postMessage + close). Stesso
 * pattern già usato per Google Calendar.
 */
function buildCallbackHtml(status: "ok" | "error", message?: string, appOrigin?: string): Response {
  const siteUrl = (appOrigin && /^https?:\/\//.test(appOrigin))
    ? appOrigin
    : (Deno.env.get("SITE_URL") || "https://app.ediliziaincloud.com");
  const params = new URLSearchParams({
    status,
    ...(message ? { message } : {}),
  });
  const redirectTo = `${siteUrl.replace(/\/$/, "")}/azienda/impostazioni/integrazioni/google-ads-callback?${params.toString()}`;
  return new Response(null, {
    status: 302,
    headers: { Location: redirectTo },
  });
}

async function handleStart(req: Request, userId: string, companyId: string): Promise<Response> {
  const { clientId } = await getCredentials();
  if (!clientId) {
    return new Response(JSON.stringify({ error: "Google Ads OAuth non configurato" }), {
      status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
  const redirectUri = await getRedirectUri();
  const appOrigin = req.headers.get("origin") || undefined;
  const state = btoa(JSON.stringify({ userId, companyId, appOrigin, ts: Date.now() }));

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return new Response(JSON.stringify({ url: `${AUTH_URL}?${params}` }), {
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

async function handleCallback(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  if (errorParam || !code || !stateParam) {
    return buildCallbackHtml("error", errorParam || "Missing code");
  }
  let state: { userId: string; companyId: string; appOrigin?: string };
  try { state = JSON.parse(atob(stateParam)); }
  catch { return buildCallbackHtml("error", "Invalid state"); }

  const { clientId, clientSecret, developerToken } = await getCredentials();
  if (!clientId || !clientSecret) {
    return buildCallbackHtml("error", "Credenziali OAuth non configurate", state.appOrigin);
  }
  const redirectUri = await getRedirectUri();

  // Token exchange
  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    console.error("[google-ads-oauth] token exchange failed:", err);
    return buildCallbackHtml("error", "Token exchange failed", state.appOrigin);
  }

  const tokens = await tokenRes.json() as {
    access_token: string; refresh_token?: string; expires_in: number; scope?: string;
  };

  // User info
  const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
    signal: AbortSignal.timeout(15000),
  });
  const userInfo = userInfoRes.ok ? await userInfoRes.json() : {};

  const encKey = getEncryptionKey();
  const db = admin();
  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();

  const { data: conn, error: upsertErr } = await db
    .from("google_ads_connections")
    .upsert({
      company_id: state.companyId,
      user_id: state.userId,
      google_account_email: userInfo.email ?? null,
      google_sub: userInfo.id ?? null,
      access_token_encrypted: await encrypt(tokens.access_token, encKey),
      refresh_token_encrypted: tokens.refresh_token ? await encrypt(tokens.refresh_token, encKey) : null,
      token_expires_at: expiresAt,
      granted_scopes: tokens.scope ? tokens.scope.split(" ") : [SCOPE],
      status: "needs_customer_selection",
      last_error: null,
    }, { onConflict: "company_id" })
    .select("id")
    .single();

  if (upsertErr || !conn) {
    console.error("[google-ads-oauth] upsert failed:", upsertErr);
    return buildCallbackHtml("error", "Errore salvataggio connessione", state.appOrigin);
  }

  // Fetch accessible customers.
  // 2026-05-27: errore salvato in last_error (visibile in UI) invece che
  // silenziato. Senza developer_token, la chiamata fallisce con 401: serve
  // un Developer Token approvato da Google Ads (richiesta su ads.google.com).
  if (!developerToken) {
    await db.from("google_ads_connections").update({
      last_error: "GOOGLE_ADS_DEVELOPER_TOKEN non configurato. Per usare l'API Google Ads serve un Developer Token approvato. Vai su https://ads.google.com → Strumenti → Centro API per richiederne uno, poi inseriscilo nelle impostazioni piattaforma.",
    }).eq("id", conn.id);
  } else {
    try {
      await fetchAndCacheCustomers(conn.id, tokens.access_token, developerToken);
      await db.from("google_ads_connections").update({ last_error: null }).eq("id", conn.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[google-ads-oauth] fetchCustomers failed:", msg);
      await db.from("google_ads_connections").update({ last_error: msg }).eq("id", conn.id);
    }
  }

  // Mirror in integrations table for legacy compat
  try {
    await db.from("integrations").upsert({
      company_id: state.companyId,
      provider: "google_ads",
      status: "connected",
      connected_by: state.userId,
      last_sync_at: new Date().toISOString(),
      health: "ok",
    }, { onConflict: "company_id,provider" });
  } catch (e) {
    console.warn("[google-ads-oauth] integrations sync skipped:", e);
  }

  return buildCallbackHtml("ok", "Selezione customer richiesta", state.appOrigin);
}

async function fetchAndCacheCustomers(connectionId: string, accessToken: string, developerToken: string) {
  // List accessible customers
  const listRes = await fetch(
    "https://googleads.googleapis.com/v17/customers:listAccessibleCustomers",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": developerToken,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!listRes.ok) {
    const bodyText = await listRes.text().catch(() => "");
    // 2026-05-27: messaggio human-readable.
    if (listRes.status === 401) {
      throw new Error("Token OAuth non valido o scope insufficienti. Riconnetti Google Ads.");
    }
    if (listRes.status === 403) {
      throw new Error(
        "Developer Token Google Ads non valido o non approvato. " +
        "Verifica su https://ads.google.com → Strumenti → Centro API che il token sia in stato 'Approvato' (non 'In attesa di test')."
      );
    }
    throw new Error(`API Google Ads errore ${listRes.status}: ${bodyText.slice(0, 200)}`);
  }
  const listJson = await listRes.json() as { resourceNames?: string[] };
  const customerIds = (listJson.resourceNames ?? []).map((rn) => rn.replace(/^customers\//, ""));
  if (customerIds.length === 0) {
    throw new Error(
      "L'account Google collegato non ha nessun account Google Ads accessibile. " +
      "Verifica di poter vedere almeno un account su https://ads.google.com con lo stesso login."
    );
  }

  const db = admin();
  await db.from("google_ads_customers_cache").delete().eq("connection_id", connectionId);

  if (customerIds.length === 0) return;

  // For each customer, fetch details via GAQL
  const rows: Array<{
    connection_id: string;
    customer_id: string;
    descriptive_name: string | null;
    currency_code: string | null;
    time_zone: string | null;
    is_manager: boolean;
    is_test_account: boolean;
    raw: unknown;
  }> = [];

  for (const customerId of customerIds) {
    try {
      const queryRes = await fetch(
        `https://googleads.googleapis.com/v17/customers/${customerId}/googleAds:searchStream`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "developer-token": developerToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager, customer.test_account FROM customer LIMIT 1",
          }),
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!queryRes.ok) {
        console.warn(`[google-ads-oauth] customer ${customerId} query failed: ${queryRes.status}`);
        rows.push({
          connection_id: connectionId, customer_id: customerId,
          descriptive_name: null, currency_code: null, time_zone: null,
          is_manager: false, is_test_account: false, raw: null,
        });
        continue;
      }
      const j = await queryRes.json() as Array<{ results?: Array<{ customer?: {
        id?: string; descriptiveName?: string; currencyCode?: string; timeZone?: string;
        manager?: boolean; testAccount?: boolean;
      } }> }>;
      const c = j[0]?.results?.[0]?.customer;
      rows.push({
        connection_id: connectionId,
        customer_id: customerId,
        descriptive_name: c?.descriptiveName ?? null,
        currency_code: c?.currencyCode ?? null,
        time_zone: c?.timeZone ?? null,
        is_manager: c?.manager ?? false,
        is_test_account: c?.testAccount ?? false,
        raw: c ?? null,
      });
    } catch (e) {
      console.warn(`[google-ads-oauth] customer ${customerId} fetch error:`, e);
    }
  }

  if (rows.length > 0) {
    await db.from("google_ads_customers_cache").insert(rows);
  } else {
    // 2026-05-27: customerIds erano > 0 ma ogni searchStream è fallito.
    // Tipico se Developer Token in stato "Pending Approval" — listAccessibleCustomers
    // funziona col solo OAuth, ma searchStream richiede approvazione.
    throw new Error(
      `Trovati ${customerIds.length} customer ID Google Ads ma le chiamate API ` +
      `searchStream sono tutte fallite. Il Developer Token Google Ads potrebbe essere ` +
      `in stato 'Pending Approval' (basic access) anziché 'Approved'. ` +
      `Verifica su https://ads.google.com → Strumenti → API Center.`
    );
  }

  // Auto-select if only one non-manager customer
  const nonManagers = rows.filter((r) => !r.is_manager && !r.is_test_account);
  if (nonManagers.length === 1) {
    const only = nonManagers[0];
    await db.from("google_ads_connections").update({
      customer_id: only.customer_id,
      customer_descriptive_name: only.descriptive_name,
      customer_currency_code: only.currency_code,
      customer_time_zone: only.time_zone,
      is_manager: false,
      is_test_account: only.is_test_account,
      status: "connected",
    }).eq("id", connectionId);
  }
}

async function handleSelectCustomer(req: Request, _userId: string, companyId: string): Promise<Response> {
  const body = await req.json() as {
    connection_id?: string;
    customer_id?: string;
    manager_customer_id?: string;
  };
  if (!body.connection_id || !body.customer_id) {
    return new Response(JSON.stringify({ error: "Parametri mancanti" }), {
      status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const db = admin();
  const { data: conn } = await db.from("google_ads_connections")
    .select("id, company_id").eq("id", body.connection_id).maybeSingle();
  if (!conn || conn.company_id !== companyId) {
    return new Response(JSON.stringify({ error: "Connessione non trovata" }), {
      status: 404, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const { data: cust } = await db.from("google_ads_customers_cache")
    .select("descriptive_name, currency_code, time_zone, is_manager, is_test_account")
    .eq("connection_id", body.connection_id).eq("customer_id", body.customer_id).maybeSingle();

  await db.from("google_ads_connections").update({
    customer_id: body.customer_id,
    customer_descriptive_name: cust?.descriptive_name ?? null,
    customer_currency_code: cust?.currency_code ?? null,
    customer_time_zone: cust?.time_zone ?? null,
    is_manager: cust?.is_manager ?? false,
    is_test_account: cust?.is_test_account ?? false,
    manager_customer_id: body.manager_customer_id ?? null,
    status: "connected",
  }).eq("id", body.connection_id);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

async function handleDisconnect(req: Request, _userId: string, companyId: string): Promise<Response> {
  const db = admin();
  await db.from("google_ads_connections").delete().eq("company_id", companyId);
  await db.from("integrations").update({ status: "disconnected" })
    .eq("company_id", companyId).eq("provider", "google_ads");
  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  if (action === "callback") return handleCallback(req);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (error || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
  const db = admin();
  const { data: profile } = await db.from("profiles").select("company_id").eq("id", user.id).maybeSingle();
  if (!profile?.company_id) {
    return new Response(JSON.stringify({ error: "Azienda non trovata" }), {
      status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
  try {
    switch (action) {
      case "start": return await handleStart(req, user.id, profile.company_id);
      case "select_customer": return await handleSelectCustomer(req, user.id, profile.company_id);
      case "disconnect": return await handleDisconnect(req, user.id, profile.company_id);
      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), {
          status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
    }
  } catch (e) {
    console.error("[google-ads-oauth] error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
