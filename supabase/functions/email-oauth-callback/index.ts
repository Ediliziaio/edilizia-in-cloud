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

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData } = await supa.auth.getUser(authHeader.replace("Bearer ", ""));
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

  // Decode state
  let stateDecoded: DecodedState;
  try {
    stateDecoded = JSON.parse(atob(body.state)) as DecodedState;
  } catch {
    return new Response(JSON.stringify({ error: "invalid_state" }), {
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

  return new Response(JSON.stringify({
    success: true,
    connection_id: connId,
    email_address: emailAddress,
    provider: stateDecoded.provider,
  }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
