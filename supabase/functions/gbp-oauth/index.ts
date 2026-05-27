/**
 * gbp-oauth — Google Business Profile (My Business) OAuth flow
 *
 * Endpoints:
 *   POST  /functions/v1/gbp-oauth?action=start       → returns { url }
 *   GET   /functions/v1/gbp-oauth?action=callback    → HTML postMessage
 *   POST  /functions/v1/gbp-oauth?action=select_location
 *           body: { connection_id, gbp_account_id, gbp_location_id }
 *           → finalizza la connection scegliendo quale location collegare
 *   POST  /functions/v1/gbp-oauth?action=disconnect  → revoca + delete connection
 *
 * Scope OAuth: https://www.googleapis.com/auth/business.manage
 * Secrets richiesti (platform_settings o env):
 *   - google_business_client_id / GOOGLE_BUSINESS_CLIENT_ID
 *   - google_business_client_secret / GOOGLE_BUSINESS_CLIENT_SECRET
 *
 * Auth: utente autenticato con company_id attiva.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
import { getEncryptionKey, encrypt } from "../_shared/encryption.ts";
import { getCorsHeaders } from "../_shared/headers.ts";

const SCOPE = "https://www.googleapis.com/auth/business.manage";

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function getRedirectUri(): Promise<string> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  return `${supabaseUrl}/functions/v1/gbp-oauth?action=callback`;
}

async function getCredentials() {
  const clientId = await getPlatformSetting("google_business_client_id", "GOOGLE_BUSINESS_CLIENT_ID");
  const clientSecret = await getPlatformSetting("google_business_client_secret", "GOOGLE_BUSINESS_CLIENT_SECRET");
  return { clientId, clientSecret };
}

/**
 * 2026-05-27 (fix bug bloccante segnalato dall'utente):
 *
 * Prima questo funzione serviva HTML inline con `<script>window.opener.postMessage(...)</script>`.
 * PROBLEMA: il gateway Supabase forza `Content-Type: text/plain` e
 * `Content-Security-Policy: default-src 'none'; sandbox` su tutte le edge
 * functions con verify_jwt=false → l'HTML veniva mostrato come testo grezzo
 * e lo script inline veniva bloccato dal CSP → `window.opener.postMessage`
 * non veniva MAI eseguito → il parent (GbpConnectionCard) restava bloccato
 * in "Connessione in corso..." indefinitamente.
 *
 * FIX: redirect 302 a una pagina React hostata su app.ediliziaincloud.com
 * (`/azienda/impostazioni/integrazioni/gbp-callback?status=...&message=...`)
 * che fa il postMessage + close. Cloudflare Pages serve la pagina con il
 * giusto CSP e content-type text/html. Stesso pattern già usato per
 * google-calendar-auth, vedi commento lì.
 *
 * Nome funzione mantenuto come `buildCallbackHtml` per non rompere i 6
 * call site esistenti — tutti continuano a funzionare invariati.
 */
function buildCallbackHtml(status: "ok" | "error", message?: string, appOrigin?: string): Response {
  const siteUrl = (appOrigin && /^https?:\/\//.test(appOrigin))
    ? appOrigin
    : (Deno.env.get("SITE_URL") || "https://app.ediliziaincloud.com");
  const params = new URLSearchParams({
    status,
    ...(message ? { message } : {}),
  });
  const redirectTo = `${siteUrl.replace(/\/$/, "")}/azienda/impostazioni/integrazioni/gbp-callback?${params.toString()}`;
  return new Response(null, {
    status: 302,
    headers: { Location: redirectTo },
  });
}

// ── START ────────────────────────────────────────────────────────────────────
async function handleStart(req: Request, userId: string, companyId: string): Promise<Response> {
  const { clientId } = await getCredentials();
  if (!clientId) {
    return new Response(
      JSON.stringify({ error: "Google Business Profile non configurato. Contatta l'amministratore." }),
      { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
    );
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

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  return new Response(JSON.stringify({ url }), {
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

// ── CALLBACK ─────────────────────────────────────────────────────────────────
async function handleCallback(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  if (errorParam || !code || !stateParam) {
    return buildCallbackHtml("error", errorParam || "Missing code");
  }

  let state: { userId: string; companyId: string; appOrigin?: string };
  try {
    state = JSON.parse(atob(stateParam));
  } catch {
    return buildCallbackHtml("error", "Invalid state");
  }

  const { clientId, clientSecret } = await getCredentials();
  if (!clientId || !clientSecret) {
    return buildCallbackHtml("error", "Credenziali OAuth non configurate", state.appOrigin);
  }
  const redirectUri = await getRedirectUri();

  // Token exchange
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
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
    console.error("[gbp-oauth] token exchange failed:", err);
    return buildCallbackHtml("error", "Token exchange failed", state.appOrigin);
  }

  const tokens = await tokenRes.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };

  // Get user info
  const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
    signal: AbortSignal.timeout(15000),
  });
  const userInfo = userInfoRes.ok ? await userInfoRes.json() : {};

  const encKey = getEncryptionKey();
  const db = admin();

  // Upsert connection
  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();
  const { data: conn, error: upsertErr } = await db
    .from("gbp_connections")
    .upsert({
      company_id: state.companyId,
      user_id: state.userId,
      google_account_email: userInfo.email ?? null,
      google_sub: userInfo.id ?? null,
      access_token_encrypted: await encrypt(tokens.access_token, encKey),
      refresh_token_encrypted: tokens.refresh_token ? await encrypt(tokens.refresh_token, encKey) : null,
      token_expires_at: expiresAt,
      granted_scopes: tokens.scope ? tokens.scope.split(" ") : [SCOPE],
      status: "connected",
      last_error: null,
    }, { onConflict: "company_id" })
    .select("id")
    .single();

  if (upsertErr || !conn) {
    console.error("[gbp-oauth] upsert connection failed:", upsertErr);
    return buildCallbackHtml("error", "Errore salvataggio connessione", state.appOrigin);
  }

  // Fetch accounts + locations and cache them
  try {
    await fetchAndCacheLocations(conn.id, tokens.access_token);
  } catch (e) {
    console.error("[gbp-oauth] fetchAndCacheLocations failed:", e);
    // Non blocchiamo l'OAuth: l'utente potrà rifare il fetch dopo
  }

  // Side-effect: registra anche in `integrations` table per compatibilità
  // con ReputationManager che già query `provider IN ('google', 'google_business')`.
  try {
    await db.from("integrations").upsert({
      company_id: state.companyId,
      provider: "google_business",
      status: "connected",
      connected_by: state.userId,
      last_sync_at: new Date().toISOString(),
      health: "ok",
    }, { onConflict: "company_id,provider" });
  } catch (e) {
    console.warn("[gbp-oauth] integrations table sync skipped:", e);
  }

  return buildCallbackHtml("ok", "Connection saved", state.appOrigin);
}

// ── Fetch + cache locations ──────────────────────────────────────────────────
async function fetchAndCacheLocations(connectionId: string, accessToken: string) {
  // 1. List accounts
  const accountsRes = await fetch(
    "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!accountsRes.ok) {
    throw new Error(`accounts fetch failed: ${accountsRes.status}`);
  }
  const accountsJson = await accountsRes.json() as {
    accounts?: Array<{ name: string; accountName?: string; type?: string }>;
  };
  const accounts = accountsJson.accounts ?? [];

  const db = admin();
  // Clear old cache
  await db.from("gbp_locations_cache").delete().eq("connection_id", connectionId);

  const allLocations: Array<{
    connection_id: string;
    gbp_account_id: string;
    gbp_location_id: string;
    display_name: string | null;
    address: string | null;
    primary_phone: string | null;
    primary_category: string | null;
    raw: unknown;
  }> = [];

  // 2. For each account, list locations
  for (const acc of accounts) {
    const locsRes = await fetch(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${acc.name}/locations?readMask=name,title,storefrontAddress,phoneNumbers,categories`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!locsRes.ok) {
      console.warn(`[gbp-oauth] locations fetch failed for ${acc.name}: ${locsRes.status}`);
      continue;
    }
    const locsJson = await locsRes.json() as {
      locations?: Array<{
        name: string;
        title?: string;
        storefrontAddress?: { addressLines?: string[]; locality?: string; postalCode?: string };
        phoneNumbers?: { primaryPhone?: string };
        categories?: { primaryCategory?: { displayName?: string } };
      }>;
    };

    for (const loc of locsJson.locations ?? []) {
      const addr = loc.storefrontAddress;
      const addressStr = addr
        ? [(addr.addressLines ?? []).join(" "), addr.postalCode, addr.locality].filter(Boolean).join(", ")
        : null;

      allLocations.push({
        connection_id: connectionId,
        gbp_account_id: acc.name,
        gbp_location_id: loc.name,
        display_name: loc.title ?? null,
        address: addressStr,
        primary_phone: loc.phoneNumbers?.primaryPhone ?? null,
        primary_category: loc.categories?.primaryCategory?.displayName ?? null,
        raw: loc,
      });
    }
  }

  if (allLocations.length > 0) {
    await db.from("gbp_locations_cache").insert(allLocations);
  }

  // Se c'è UNA sola location, selezionala automaticamente
  if (allLocations.length === 1) {
    const only = allLocations[0];
    await db.from("gbp_connections").update({
      gbp_account_id: only.gbp_account_id,
      gbp_account_name: accounts.find((a) => a.name === only.gbp_account_id)?.accountName ?? null,
      gbp_location_id: only.gbp_location_id,
      gbp_location_name: only.display_name,
      gbp_location_address: only.address,
    }).eq("id", connectionId);
  }

  return allLocations;
}

// ── SELECT LOCATION ──────────────────────────────────────────────────────────
async function handleSelectLocation(req: Request, userId: string, companyId: string): Promise<Response> {
  const body = await req.json() as {
    connection_id?: string;
    gbp_account_id?: string;
    gbp_location_id?: string;
  };
  if (!body.connection_id || !body.gbp_account_id || !body.gbp_location_id) {
    return new Response(JSON.stringify({ error: "Parametri mancanti" }), {
      status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const db = admin();
  // Verify ownership
  const { data: conn } = await db
    .from("gbp_connections")
    .select("id, company_id")
    .eq("id", body.connection_id)
    .maybeSingle();
  if (!conn || conn.company_id !== companyId) {
    return new Response(JSON.stringify({ error: "Connessione non trovata" }), {
      status: 404, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  // Find location in cache
  const { data: loc } = await db
    .from("gbp_locations_cache")
    .select("display_name, address")
    .eq("connection_id", body.connection_id)
    .eq("gbp_location_id", body.gbp_location_id)
    .maybeSingle();

  await db.from("gbp_connections").update({
    gbp_account_id: body.gbp_account_id,
    gbp_location_id: body.gbp_location_id,
    gbp_location_name: loc?.display_name ?? null,
    gbp_location_address: loc?.address ?? null,
  }).eq("id", body.connection_id);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

// ── DISCONNECT ───────────────────────────────────────────────────────────────
async function handleDisconnect(req: Request, _userId: string, companyId: string): Promise<Response> {
  const db = admin();
  await db.from("gbp_connections").delete().eq("company_id", companyId);
  await db.from("integrations").update({ status: "disconnected" })
    .eq("company_id", companyId).eq("provider", "google_business");

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

// ── Entry point ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  // Callback non richiede auth (è il redirect di Google)
  if (action === "callback") {
    return handleCallback(req);
  }

  // Altri endpoint richiedono auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser(
    authHeader.replace("Bearer ", ""),
  );
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  // Get user's company
  const db = admin();
  const { data: profile } = await db
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.company_id) {
    return new Response(JSON.stringify({ error: "Azienda non trovata" }), {
      status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  try {
    switch (action) {
      case "start":
        return await handleStart(req, user.id, profile.company_id);
      case "select_location":
        return await handleSelectLocation(req, user.id, profile.company_id);
      case "disconnect":
        return await handleDisconnect(req, user.id, profile.company_id);
      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), {
          status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
    }
  } catch (e) {
    console.error("[gbp-oauth] handler error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
