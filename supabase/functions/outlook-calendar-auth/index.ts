/**
 * outlook-calendar-auth — OAuth flow Microsoft 365 / Outlook Calendar
 *
 * Endpoints:
 *   POST  /functions/v1/outlook-calendar-auth?action=start       → { url }
 *   GET   /functions/v1/outlook-calendar-auth?action=callback    → HTML postMessage
 *   POST  /functions/v1/outlook-calendar-auth?action=disconnect  → revoca
 *
 * Scopes: Calendars.ReadWrite offline_access User.Read
 * Tenant: /common (multi-tenant + personal accounts)
 *
 * Secrets (platform_settings o env):
 *   - outlook_client_id / OUTLOOK_CLIENT_ID  (Azure AD App ID)
 *   - outlook_client_secret / OUTLOOK_CLIENT_SECRET (Secret Value, NON Secret ID)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
import { getEncryptionKey, encrypt } from "../_shared/encryption.ts";
import { getCorsHeaders } from "../_shared/headers.ts";

const SCOPES = ["openid", "profile", "offline_access", "User.Read", "Calendars.ReadWrite"].join(" ");
const AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function getRedirectUri(): Promise<string> {
  return `${Deno.env.get("SUPABASE_URL")!}/functions/v1/outlook-calendar-auth?action=callback`;
}

async function getCredentials() {
  return {
    clientId: await getPlatformSetting("outlook_client_id", "OUTLOOK_CLIENT_ID"),
    clientSecret: await getPlatformSetting("outlook_client_secret", "OUTLOOK_CLIENT_SECRET"),
  };
}

function buildCallbackHtml(status: "ok" | "error", message?: string, appOrigin?: string): Response {
  const origin = appOrigin && /^https?:\/\//.test(appOrigin) ? appOrigin : "*";
  const payload = JSON.stringify({ source: "outlook-calendar-oauth", status, message: message ?? null });
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Outlook OAuth</title></head>
<body style="font-family:system-ui;padding:24px;text-align:center;">
<p>${status === "ok" ? "✅ Collegamento completato. Puoi chiudere questa finestra." : `❌ Errore: ${message ?? "sconosciuto"}`}</p>
<script>
try { window.opener && window.opener.postMessage(${payload}, ${JSON.stringify(origin)}); } catch (e) {}
setTimeout(() => window.close(), 1500);
</script></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

async function handleStart(req: Request, userId: string, companyId: string): Promise<Response> {
  const { clientId } = await getCredentials();
  if (!clientId) {
    return new Response(JSON.stringify({ error: "Outlook OAuth non configurato" }), {
      status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
  const redirectUri = await getRedirectUri();
  const appOrigin = req.headers.get("origin") || undefined;
  const state = btoa(JSON.stringify({ userId, companyId, appOrigin, ts: Date.now() }));

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: SCOPES,
    state,
    prompt: "select_account",
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

  const { clientId, clientSecret } = await getCredentials();
  if (!clientId || !clientSecret) {
    return buildCallbackHtml("error", "Credenziali OAuth non configurate", state.appOrigin);
  }
  const redirectUri = await getRedirectUri();

  // Token exchange
  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      scope: SCOPES,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    console.error("[outlook-calendar-auth] token exchange failed:", err);
    return buildCallbackHtml("error", "Token exchange failed", state.appOrigin);
  }

  const tokens = await tokenRes.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };

  // Fetch user profile (email + oid)
  const meRes = await fetch("https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName,displayName", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
    signal: AbortSignal.timeout(15000),
  });
  const me = meRes.ok ? await meRes.json() as { id?: string; mail?: string; userPrincipalName?: string } : {};

  const encKey = getEncryptionKey();
  const db = admin();
  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();

  const { data: conn, error: upsertErr } = await db
    .from("outlook_calendar_connections")
    .upsert({
      company_id: state.companyId,
      user_id: state.userId,
      microsoft_account_email: me.mail ?? me.userPrincipalName ?? null,
      microsoft_oid: me.id ?? null,
      access_token_encrypted: await encrypt(tokens.access_token, encKey),
      refresh_token_encrypted: tokens.refresh_token ? await encrypt(tokens.refresh_token, encKey) : null,
      token_expires_at: expiresAt,
      granted_scopes: tokens.scope ? tokens.scope.split(" ") : SCOPES.split(" "),
      status: "connected",
      last_error: null,
    }, { onConflict: "user_id" })
    .select("id")
    .single();

  if (upsertErr || !conn) {
    console.error("[outlook-calendar-auth] upsert failed:", upsertErr);
    return buildCallbackHtml("error", "Errore salvataggio", state.appOrigin);
  }

  // Cache calendars
  try {
    await fetchAndCacheCalendars(conn.id, tokens.access_token);
  } catch (e) {
    console.error("[outlook-calendar-auth] cache calendars failed:", e);
  }

  return buildCallbackHtml("ok", "Collegamento completato", state.appOrigin);
}

async function fetchAndCacheCalendars(connectionId: string, accessToken: string) {
  const res = await fetch("https://graph.microsoft.com/v1.0/me/calendars?$select=id,name,color,isDefaultCalendar,canEdit,owner", {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`calendars fetch failed: ${res.status}`);
  const json = await res.json() as { value?: Array<{
    id: string; name?: string; color?: string;
    isDefaultCalendar?: boolean; canEdit?: boolean;
    owner?: { name?: string; address?: string };
  }>; };
  const calendars = json.value ?? [];

  const db = admin();
  await db.from("outlook_calendars_cache").delete().eq("connection_id", connectionId);

  if (calendars.length > 0) {
    await db.from("outlook_calendars_cache").insert(calendars.map((c) => ({
      connection_id: connectionId,
      outlook_calendar_id: c.id,
      name: c.name ?? null,
      color: c.color ?? null,
      is_default_calendar: c.isDefaultCalendar ?? false,
      can_edit: c.canEdit ?? false,
      owner_name: c.owner?.name ?? null,
      owner_address: c.owner?.address ?? null,
      raw: c,
    })));

    // Auto-select default calendar (primary)
    const primary = calendars.find((c) => c.isDefaultCalendar) ?? calendars[0];
    if (primary) {
      await db.from("outlook_calendar_connections").update({
        primary_calendar_id: primary.id,
        primary_calendar_name: primary.name ?? null,
        synced_calendar_ids: [primary.id],
      }).eq("id", connectionId);
    }
  }
}

async function handleDisconnect(req: Request, userId: string, _companyId: string): Promise<Response> {
  const db = admin();
  await db.from("outlook_calendar_connections").delete().eq("user_id", userId);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
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
      case "disconnect": return await handleDisconnect(req, user.id, profile.company_id);
      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), {
          status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
    }
  } catch (e) {
    console.error("[outlook-calendar-auth] error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
