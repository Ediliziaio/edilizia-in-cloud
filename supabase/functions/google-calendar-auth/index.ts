import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
import { getEncryptionKey, encrypt, decrypt } from "../_shared/encryption.ts";
import { canAccessCompany } from "../_shared/effectiveCompany.ts";

import { getCorsHeaders } from "../_shared/headers.ts";

// 2026-05-27 (BUG #2): mancavano scope userinfo.email + userinfo.profile.
// Senza questi, la chiamata a /oauth2/v2/userinfo ritornava 403
// "Insufficient Permission" → userInfo={} → google_account_email NULL.
// `openid` è raccomandato per la conformità OIDC.
const SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// encrypt/decrypt/getEncryptionKey imported from _shared/encryption.ts

async function getRedirectUri(): Promise<string> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  return `${supabaseUrl}/functions/v1/google-calendar-auth?action=callback`;
}

// ---- ACTION HANDLERS ----

async function handleStart(req: Request, userId: string, companyId: string): Promise<Response> {
  const clientId = await getPlatformSetting("google_calendar_client_id", "GOOGLE_CALENDAR_CLIENT_ID");
  if (!clientId) {
    return new Response(JSON.stringify({ error: "Google Calendar non configurato. Contatta l'amministratore." }), {
      status: 400,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const redirectUri = await getRedirectUri();
  const appOrigin = req.headers.get("origin") || undefined;
  const state = btoa(JSON.stringify({ userId, companyId, appOrigin, ts: Date.now() }));

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  return new Response(JSON.stringify({ url }), {
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

async function handleCallback(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error || !code || !stateParam) {
    return buildCallbackHtml("error", error || "Missing code");
  }

  let state: { userId: string; companyId: string; appOrigin?: string };
  try {
    state = JSON.parse(atob(stateParam));
  } catch {
    return buildCallbackHtml("error", "Invalid state");
  }

  const clientId = await getPlatformSetting("google_calendar_client_id", "GOOGLE_CALENDAR_CLIENT_ID");
  const clientSecret = await getPlatformSetting("google_calendar_client_secret", "GOOGLE_CALENDAR_CLIENT_SECRET");
  const redirectUri = await getRedirectUri();

  // Exchange code for tokens
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
    console.error("Token exchange failed:", err);
    return buildCallbackHtml("error", "Token exchange failed", state.appOrigin);
  }

  const tokens = await tokenRes.json();
  const encKey = getEncryptionKey();

  // Get user info from Google
  const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
    signal: AbortSignal.timeout(15000),
  });
  const userInfo = userInfoRes.ok ? await userInfoRes.json() : {};

  const admin = getSupabaseAdmin();

  // Upsert connection
  const { error: upsertErr } = await admin
    .from("google_calendar_connections")
    .upsert(
      // 2026-05-27 (BUG CRITICO): encrypt è async — senza await il DB
      // salvava "[object Promise]" come token cifrato → connessione corrotta
      // dal momento OAuth. Risultato: google_account_email NULL e sync
      // permanentemente 401. Fix: await su ogni encrypt/decrypt asincrono.
      {
        company_id: state.companyId,
        user_id: state.userId,
        google_account_email: userInfo.email || null,
        google_sub: userInfo.id || null,
        access_token_encrypted: await encrypt(tokens.access_token, encKey),
        refresh_token_encrypted: tokens.refresh_token ? await encrypt(tokens.refresh_token, encKey) : null,
        token_expires_at: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
          : null,
        status: "connected",
        last_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id,user_id" }
    );

  if (upsertErr) {
    console.error("Upsert connection error:", upsertErr);
    return buildCallbackHtml("error", "Database error", state.appOrigin);
  }

  // Ensure settings row exists. 2026-05-26: defaultiamo `primary_calendar_id`
  // a "primary" (keyword Google per il calendario di default dell'utente) così
  // la sync function ha sempre un calendar id valido senza richiedere allo
  // user di fare manualmente "Seleziona calendario" dopo OAuth.
  await admin.from("google_calendar_settings").upsert(
    {
      company_id: state.companyId,
      user_id: state.userId,
      connection_id: undefined, // will be linked after
      primary_calendar_id: "primary",
    },
    { onConflict: "company_id,user_id", ignoreDuplicates: true }
  );

  // Link connection_id to settings
  const { data: conn } = await admin
    .from("google_calendar_connections")
    .select("id")
    .eq("company_id", state.companyId)
    .eq("user_id", state.userId)
    .single();

  if (conn) {
    await admin
      .from("google_calendar_settings")
      .update({ connection_id: conn.id })
      .eq("company_id", state.companyId)
      .eq("user_id", state.userId);
  }

  // FASE 4: Auto-register webhook watch after successful OAuth
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  try {
    await fetch(`${supabaseUrl}/functions/v1/google-calendar-webhook?action=register_watch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ companyId: state.companyId, userId: state.userId }),
    });
  } catch (e) {
    console.warn("Auto watch registration failed (non-critical):", e);
  }

  // 2026-05-26: trigger sync immediato dopo OAuth (fire-and-forget). Senza
  // questo, l'utente collegava il calendario ma vedeva la pagina vuota finché
  // non cliccava "Sincronizza ora" — confondente. Il primo sync popola
  // google_calendar_busy_slots con gli eventi delle prossime 4 settimane.
  try {
    fetch(`${supabaseUrl}/functions/v1/google-calendar-sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ companyId: state.companyId, userId: state.userId }),
    }).catch((e) => console.warn("Auto initial sync failed (non-critical):", e));
  } catch (e) {
    console.warn("Auto initial sync schedule failed:", e);
  }

  return buildCallbackHtml("success", undefined, state.appOrigin);
}

async function handleDisconnect(req: Request, userId: string, companyId: string): Promise<Response> {
  const admin = getSupabaseAdmin();

  // Try to revoke token first
  const { data: conn } = await admin
    .from("google_calendar_connections")
    .select("access_token_encrypted")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .single();

  if (conn?.access_token_encrypted) {
    try {
      const encKey = getEncryptionKey();
      const token = await decrypt(conn.access_token_encrypted, encKey);
      await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, { method: "POST", signal: AbortSignal.timeout(10000) });
    } catch (e) {
      console.warn("Token revoke failed (non-critical):", e);
    }
  }

  // Delete all related data
  await admin.from("google_calendar_busy_slots").delete().eq("company_id", companyId).eq("user_id", userId);
  await admin.from("google_calendar_event_map").delete().eq("company_id", companyId).eq("user_id", userId);
  await admin.from("google_calendar_settings").delete().eq("company_id", companyId).eq("user_id", userId);
  await admin.from("google_calendar_connections").delete().eq("company_id", companyId).eq("user_id", userId);

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

async function handleRefresh(req: Request, userId: string, companyId: string): Promise<Response> {
  const admin = getSupabaseAdmin();
  const encKey = getEncryptionKey();

  const { data: conn } = await admin
    .from("google_calendar_connections")
    .select("*")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .single();

  if (!conn?.refresh_token_encrypted) {
    return new Response(JSON.stringify({ error: "No refresh token" }), {
      status: 400,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const clientId = await getPlatformSetting("google_calendar_client_id", "GOOGLE_CALENDAR_CLIENT_ID");
  const clientSecret = await getPlatformSetting("google_calendar_client_secret", "GOOGLE_CALENDAR_CLIENT_SECRET");
  const refreshToken = await decrypt(conn.refresh_token_encrypted, encKey);

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
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

  if (!tokenRes.ok) {
    await admin
      .from("google_calendar_connections")
      .update({ status: "token_expired", last_error: "Refresh token failed" })
      .eq("id", conn.id);
    return new Response(JSON.stringify({ error: "Refresh failed" }), {
      status: 401,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const tokens = await tokenRes.json();
  const newAccessTokenEncrypted = await encrypt(tokens.access_token, encKey);
  await admin
    .from("google_calendar_connections")
    .update({
      access_token_encrypted: newAccessTokenEncrypted,
      token_expires_at: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : conn.token_expires_at,
      status: "connected",
      last_error: null,
    })
    .eq("id", conn.id);

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

async function handleListCalendars(req: Request, userId: string, companyId: string): Promise<Response> {
  const admin = getSupabaseAdmin();
  const encKey = getEncryptionKey();

  const { data: conn } = await admin
    .from("google_calendar_connections")
    .select("*")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .single();

  if (!conn) {
    return new Response(JSON.stringify({ error: "Not connected" }), {
      status: 404,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  // Check if token needs refresh
  let accessToken = await decrypt(conn.access_token_encrypted, encKey);
  if (conn.token_expires_at && new Date(conn.token_expires_at) < new Date()) {
    const refreshRes = await handleRefresh(req, userId, companyId);
    if (!refreshRes.ok) {
      return refreshRes;
    }
    // Re-fetch updated token
    const { data: updated } = await admin
      .from("google_calendar_connections")
      .select("access_token_encrypted")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .single();
    if (updated) accessToken = await decrypt(updated.access_token_encrypted, encKey);
  }

  const calRes = await fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList",
    { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15000) }
  );

  if (!calRes.ok) {
    const errText = await calRes.text();
    console.error("Google Calendar list failed:", errText);
    return new Response(JSON.stringify({ error: "Failed to fetch calendars" }), {
      status: 502,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const calData = await calRes.json();
  const calendars = (calData.items || []).map((c: any) => ({
    id: c.id,
    summary: c.summary,
    primary: c.primary || false,
    backgroundColor: c.backgroundColor,
    accessRole: c.accessRole,
  }));

  return new Response(JSON.stringify({ calendars }), {
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

/**
 * 2026-05-26: PRIMA tornavamo HTML inline con <script> per fare postMessage al
 * parent. PROBLEMA: il gateway Supabase forza `Content-Type: text/plain` e
 * `Content-Security-Policy: default-src 'none'; sandbox` su tutte le edge
 * functions con verify_jwt=false → l'HTML veniva mostrato come testo grezzo
 * nel popup (vedi screenshot utente).
 *
 * FIX: redirect 302 a una pagina React hostata su app.ediliziaincloud.com che
 * fa il postMessage + close. Cloudflare Pages serve la pagina con il giusto
 * CSP (script-src 'self' 'unsafe-inline') e content-type text/html.
 */
function buildCallbackRedirect(status: string, error?: string, appOrigin?: string): Response {
  const siteUrl = appOrigin || Deno.env.get("SITE_URL") || "https://app.ediliziaincloud.com";
  const params = new URLSearchParams({
    status,
    ...(error ? { error } : {}),
    provider: "google_calendar",
  });
  const redirectTo = `${siteUrl.replace(/\/$/, "")}/azienda/impostazioni/integrazioni/calendar-callback?${params.toString()}`;
  return new Response(null, {
    status: 302,
    headers: { Location: redirectTo },
  });
}

// Backward-compat alias: tutti i call site esistenti continuano a funzionare.
const buildCallbackHtml = buildCallbackRedirect;

// ---- MAIN HANDLER ----

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    // Callback is GET (redirect from Google)
    if (req.method === "GET") {
      const url = new URL(req.url);
      if (url.searchParams.has("code") || url.searchParams.has("error")) {
        return handleCallback(req);
      }
      return new Response("OK", { headers: getCorsHeaders(req) });
    }

    // All other actions are POST with JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;
    const body = await req.json();
    const { action, companyId } = body;

    if (!companyId) {
      return new Response(JSON.stringify({ error: "companyId required" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // P0 Security: validate the active tenant, including multi-company access.
    const admin = getSupabaseAdmin();
    if (!(await canAccessCompany(admin, userId, companyId))) {
      return new Response(JSON.stringify({ error: "Company mismatch" }), {
        status: 403,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    switch (action) {
      case "start":
        return handleStart(req, userId, companyId);
      case "disconnect":
        return handleDisconnect(req, userId, companyId);
      case "refresh":
        return handleRefresh(req, userId, companyId);
      case "list-calendars":
        return handleListCalendars(req, userId, companyId);
      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
    }
  } catch (e) {
    console.error("google-calendar-auth error:", e);
    return new Response(JSON.stringify({ error: e.message || "Internal error" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
