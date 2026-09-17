/**
 * outlook-calendar-auth — OAuth flow Microsoft 365 / Outlook Calendar
 *
 * Endpoints:
 *   POST  /functions/v1/outlook-calendar-auth?action=start       → { url }
 *   GET   /functions/v1/outlook-calendar-auth?code=…&state=…    → callback (URL registrato in Azure SENZA query)
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
import { getEncryptionKey, encrypt } from "../_shared/encryption.ts";
import { getCorsHeaders, origineAmmessa } from "../_shared/headers.ts";
import { creaStateFirmato, leggiStateFirmato } from "../_shared/oauthState.ts";
import { canAccessCompany } from "../_shared/effectiveCompany.ts";
import { getMsOAuthCredentials } from "../_shared/msOAuth.ts";

const SCOPES = ["openid", "profile", "offline_access", "User.Read", "Calendars.ReadWrite"].join(" ");
const AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// Azure NON accetta URL di reindirizzamento con una query string: il vecchio
// `?action=callback` faceva fallire la registrazione dell'app. L'URL registrato
// e' quindi nudo, e il ritorno si riconosce dai parametri che Microsoft
// aggiunge da solo (code/state, oppure error).
async function getRedirectUri(): Promise<string> {
  return `${Deno.env.get("SUPABASE_URL")!}/functions/v1/outlook-calendar-auth`;
}

async function getCredentials() {
  // Stessa app Azure della posta: una configurazione accende entrambe.
  return await getMsOAuthCredentials();
}

// La piattaforma Supabase RISCRIVE le risposte HTML delle edge function sul
// dominio condiviso *.supabase.co (text/plain + CSP sandbox): il popup
// mostrerebbe il SORGENTE della pagina, con dentro origini e dettagli
// interni. Quindi niente HTML: 302 verso /oauth-done sull'app (stessa
// origin dell'opener), che fa il postMessage e chiude il popup.
function buildCallbackHtml(status: "ok" | "error", message?: string, appOrigin?: string): Response {
  const siteUrl = Deno.env.get("SITE_URL") || "https://app.ediliziaincloud.com";
  const origin = appOrigin && origineAmmessa(appOrigin) ? appOrigin : siteUrl;
  const hash = new URLSearchParams({
    kind: "outlook",
    status,
    message: (message ?? "").replace(/[<>"']/g, "").slice(0, 200),
  }).toString();
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${origin.replace(/\/$/, "")}/oauth-done#${hash}`,
      "Cache-Control": "no-store",
    },
  });
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
  const state = await creaStateFirmato({ userId, companyId, appOrigin });

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

  const state = await leggiStateFirmato(stateParam);
  if (!state) return buildCallbackHtml("error", "Collegamento scaduto o non valido: riprova");

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
    }, { onConflict: "company_id,user_id" })
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

async function handleDisconnect(req: Request, userId: string, companyId: string): Promise<Response> {
  const db = admin();
  // Solo il collegamento di questa azienda: con più aziende ognuna ha il suo.
  const { error } = await db.from("outlook_calendar_connections").delete().eq("user_id", userId).eq("company_id", companyId);
  if (error) {
    return new Response(JSON.stringify({ error: "Scollegamento non riuscito" }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  const url = new URL(req.url);
  const sp = url.searchParams;
  // Callback = c'e' `code` (o `error`) di Microsoft; `action=callback` resta
  // accettato per compatibilita' con eventuali link vecchi.
  const action = sp.get("action") ?? ((sp.has("code") || sp.has("error")) ? "callback" : null);

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
  // L'azienda attiva della pagina (multi-azienda), come per Google e Apple;
  // senza, quella del profilo. Prima valeva sempre quella del profilo: da
  // un'azienda secondaria il collegamento finiva nell'altra.
  const corpo = (await req.clone().json().catch(() => ({}))) as { companyId?: string };
  let companyId = typeof corpo.companyId === "string" && corpo.companyId ? corpo.companyId : null;
  if (!companyId) {
    const { data: profile } = await db.from("profiles").select("company_id").eq("id", user.id).maybeSingle();
    companyId = profile?.company_id ?? null;
  }
  if (!companyId) {
    return new Response(JSON.stringify({ error: "Azienda non trovata" }), {
      status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
  // deno-lint-ignore no-explicit-any
  if (!(await canAccessCompany(db as any, user.id, companyId))) {
    return new Response(JSON.stringify({ error: "Accesso all'azienda non consentito" }), {
      status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  try {
    switch (action) {
      case "start": return await handleStart(req, user.id, companyId);
      case "disconnect": return await handleDisconnect(req, user.id, companyId);
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
