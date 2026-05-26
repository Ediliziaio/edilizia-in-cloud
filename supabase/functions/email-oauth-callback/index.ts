/**
 * email-oauth-callback — GAP 7b
 *
 * Riceve `code` + `state` dal redirect OAuth (Gmail/Outlook), scambia per
 * access+refresh tokens, salva in email_oauth_connections cifrati.
 *
 * Body POST:
 *   { code: string, state: string, redirect_uri: string }
 *
 * Risposta:
 *   { success: true, connection_id: uuid, email_address: string, provider }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { canAccessCompany } from "../_shared/effectiveCompany.ts";

interface CallbackBody {
  code: string;
  state: string;
  redirect_uri: string;
}

interface DecodedState {
  user_id: string;
  company_id: string;
  provider: "gmail" | "outlook";
  nonce: string;
  iat: number;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
}

const GMAIL_TOKEN_URL = "https://oauth2.googleapis.com/token";
const OUTLOOK_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), "=");
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function base64UrlEncode(value: Uint8Array): string {
  let bin = "";
  for (const b of value) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signStatePayload(payloadB64: string): Promise<string> {
  const secret = Deno.env.get("EMAIL_OAUTH_STATE_SECRET")
    ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    ?? "";
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));
  return base64UrlEncode(new Uint8Array(sig));
}

async function decodeAndVerifyState(state: string): Promise<DecodedState> {
  if (state.includes(".")) {
    const [payloadB64, signature] = state.split(".");
    if (!payloadB64 || !signature) throw new Error("invalid_state");
    const expected = await signStatePayload(payloadB64);
    if (signature !== expected) throw new Error("invalid_state_signature");
    return JSON.parse(decoder.decode(base64UrlToBytes(payloadB64))) as DecodedState;
  }

  // Compatibilità con redirect già aperti prima dell'hardening.
  return JSON.parse(atob(state)) as DecodedState;
}

async function fetchUserEmail(provider: "gmail" | "outlook", accessToken: string): Promise<string | null> {
  try {
    if (provider === "gmail") {
      const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return null;
      const json = await res.json() as { email?: string };
      return json.email ?? null;
    } else {
      const res = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return null;
      const json = await res.json() as { mail?: string; userPrincipalName?: string };
      return json.mail ?? json.userPrincipalName ?? null;
    }
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Auth utente (deve essere lo stesso che ha started)
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "auth_required" }), {
      status: 401, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Client per auth verification (passa il JWT utente, ruolo `authenticated`).
  const supaUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  // Client per operazioni DB amministrative (NESSUN JWT utente → ruolo `service_role`).
  // Fix 2026-05-26: prima usavamo un solo client con JWT → la rpc()
  // veniva eseguita come `authenticated` invece che `service_role`,
  // generando "permission denied for function email_oauth_upsert_connection"
  // anche con i GRANT corretti. Cf. Supabase JS client docs su role downgrade.
  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: userData } = await supaUser.auth.getUser(authHeader.replace("Bearer ", ""));
  const user = userData?.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "auth_invalid" }), {
      status: 401, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const body = (await req.json().catch(() => ({}))) as CallbackBody;
  if (!body.code || !body.state || !body.redirect_uri) {
    return new Response(JSON.stringify({ error: "missing_fields" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Decode + verify state
  let stateDecoded: DecodedState;
  try {
    stateDecoded = await decodeAndVerifyState(body.state);
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "invalid_state" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // CSRF check: state user_id deve matchare il bearer
  if (stateDecoded.user_id !== user.id) {
    return new Response(JSON.stringify({ error: "csrf_state_mismatch" }), {
      status: 403, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  // State expiry: max 10 minuti
  if (Date.now() - stateDecoded.iat > 10 * 60 * 1000) {
    return new Response(JSON.stringify({ error: "state_expired" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (!(await canAccessCompany(supa, user.id, stateDecoded.company_id))) {
    return new Response(JSON.stringify({ error: "company_access_denied" }), {
      status: 403, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Exchange code per tokens
  let tokenUrl: string;
  let clientId: string | undefined;
  let clientSecret: string | undefined;
  if (stateDecoded.provider === "gmail") {
    tokenUrl = GMAIL_TOKEN_URL;
    clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
    clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");
  } else {
    tokenUrl = OUTLOOK_TOKEN_URL;
    clientId = Deno.env.get("MS_OAUTH_CLIENT_ID");
    clientSecret = Deno.env.get("MS_OAUTH_CLIENT_SECRET");
  }
  if (!clientId || !clientSecret) {
    return new Response(JSON.stringify({ error: `${stateDecoded.provider}_oauth_not_configured` }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const tokenRes = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: body.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: body.redirect_uri,
      grant_type: "authorization_code",
    }).toString(),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    console.error(`[email-oauth-callback] token exchange failed:`, err.substring(0, 300));
    return new Response(JSON.stringify({
      error: "token_exchange_failed",
      detail: err.substring(0, 300),
    }), {
      status: 502, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const tokens = await tokenRes.json() as TokenResponse;

  // Fetch user email da provider
  const emailAddress = await fetchUserEmail(stateDecoded.provider, tokens.access_token);
  if (!emailAddress) {
    return new Response(JSON.stringify({ error: "user_email_fetch_failed" }), {
      status: 502, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Calcola expires_at
  const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000)).toISOString();
  const scopes = (tokens.scope ?? "").split(/\s+/).filter(Boolean);

  // Upsert connection (cifrata via RPC)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: connId, error: rpcErr } = await (supa as any).rpc(
    "email_oauth_upsert_connection",
    {
      p_company_id: stateDecoded.company_id,
      p_user_id: user.id,
      p_provider: stateDecoded.provider,
      p_email_address: emailAddress,
      p_access_token: tokens.access_token,
      p_refresh_token: tokens.refresh_token ?? null,
      p_expires_at: expiresAt,
      p_scopes: scopes,
    },
  );

  if (rpcErr || !connId) {
    console.error(`[email-oauth-callback] DB upsert failed:`, rpcErr);
    return new Response(JSON.stringify({
      error: "db_save_failed",
      detail: rpcErr?.message,
    }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Seed idempotente delle cartelle personali (Inbox/Inviati/Bozze/Spam/Cestino).
  // Fix 2026-05-27: supabase-js v2 rpc() ritorna PostgrestBuilder che è
  // thenable ma non ha .catch() → usavamo .catch() inline e produceva
  // "TypeError: rpc(...).catch is not a function" DOPO il salvataggio
  // della connection (il save funzionava ma il callback frontend riceveva
  // 500 e mostrava "Connessione fallita" all'utente). Wrappato in try/catch
  // standard: errori di seed sono non-bloccanti.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const seedResult = await (supa as any).rpc("email_seed_user_folders", {
      p_user_id: user.id,
      p_company_id: stateDecoded.company_id,
    });
    if (seedResult?.error) {
      console.warn("[email-oauth-callback] folder seed returned error:", seedResult.error);
    }
  } catch (e) {
    console.warn("[email-oauth-callback] folder seed threw:", e);
  }

  return new Response(JSON.stringify({
    success: true,
    connection_id: connId,
    email_address: emailAddress,
    provider: stateDecoded.provider,
  }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
