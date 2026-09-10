/**
 * email-oauth-start — GAP 7b
 *
 * Inizia il flow OAuth per Gmail o Outlook.
 *
 * Body POST:
 *   { provider: "gmail" | "outlook", redirect_uri: string }
 *
 * Risposta:
 *   { auth_url: string, state: string }
 *
 * L'utente viene rediretto a auth_url, completa OAuth Google/Microsoft, viene
 * rediretto al redirect_uri con `code` e `state`. Il frontend chiama poi
 * email-oauth-callback con il code.
 *
 * Auth: utente autenticato con azienda attiva. La casella resta personale
 * (user_id = auth.uid()) e non condivisa con il tenant.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { canAccessCompany } from "../_shared/effectiveCompany.ts";
import { getMsOAuthCredentials } from "../_shared/msOAuth.ts";

interface StartBody {
  provider: "gmail" | "outlook";
  redirect_uri: string;
  company_id?: string;
}

const GMAIL_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const OUTLOOK_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify", // per marcare letti
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
];
const OUTLOOK_SCOPES = [
  "openid",
  "offline_access",
  "Mail.Read",
  "Mail.ReadWrite",
  "Mail.Send",
  "User.Read",
];

const encoder = new TextEncoder();

function base64UrlEncode(value: string | Uint8Array): string {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
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

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Auth: qualsiasi utente autenticato con profilo aziendale.
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

  const body = (await req.json().catch(() => ({}))) as StartBody;

  // Usa l'azienda attiva del frontend quando presente. Il collegamento resta
  // personale (user_id = auth.uid()), ma il tenant deve essere quello scelto.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let companyId = typeof body.company_id === "string" && body.company_id.trim()
    ? body.company_id.trim()
    : undefined;
  if (!companyId) {
    const { data: profile } = await (supa as any)
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .maybeSingle();
    companyId = profile?.company_id as string | undefined;
  }
  if (!companyId) {
    return new Response(JSON.stringify({ error: "company_profile_required" }), {
      status: 403, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (!(await canAccessCompany(supa, user.id, companyId))) {
    return new Response(JSON.stringify({ error: "company_access_denied" }), {
      status: 403, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (!body.provider || (body.provider !== "gmail" && body.provider !== "outlook")) {
    return new Response(JSON.stringify({ error: "invalid_provider" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  if (!body.redirect_uri || !body.redirect_uri.startsWith("http")) {
    return new Response(JSON.stringify({ error: "invalid_redirect_uri" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Genera state CSRF-safe: payload + firma HMAC server-side.
  const stateRandom = crypto.randomUUID();
  const statePayload = {
    user_id: user.id,
    company_id: companyId,
    provider: body.provider,
    nonce: stateRandom,
    iat: Date.now(),
  };
  const payloadB64 = base64UrlEncode(JSON.stringify(statePayload));
  const state = `${payloadB64}.${await signStatePayload(payloadB64)}`;

  /**
   * Un identificativo applicazione non è un segreto — viaggia nell'indirizzo
   * della pagina di consenso, sotto gli occhi di chi collega la casella. Un
   * SEGRETO messo lì per sbaglio finirebbe nello stesso posto: nella barra
   * degli indirizzi, nella cronologia, nei log di mezzo mondo.
   *
   * Il 10/09/2026 è successo: in `MS_OAUTH_CLIENT_ID` c'era un valore con la
   * forma di un client secret di Azure. Il collegamento a Outlook non poteva
   * funzionare, e intanto il segreto usciva a ogni tentativo. Meglio fermarsi
   * prima, con un messaggio che dice cosa è successo.
   */
  const identificativoSospetto = (valore: string, provider: "gmail" | "outlook"): string | null => {
    const v = valore.trim();
    if (provider === "outlook") {
      const guid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
      if (!guid.test(v)) {
        return "MS_OAUTH_CLIENT_ID non ha la forma di un ID applicazione Azure "
          + "(deve essere un GUID, es. 11111111-2222-3333-4444-555555555555). "
          + "Se ci fosse finito il client secret, va rigenerato su Azure prima di riusarlo.";
      }
      return null;
    }
    if (!v.endsWith(".apps.googleusercontent.com")) {
      return "GOOGLE_OAUTH_CLIENT_ID non ha la forma di un ID applicazione Google "
        + "(deve finire con .apps.googleusercontent.com).";
    }
    return null;
  };

  let authUrl: string;
  if (body.provider === "gmail") {
    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
    if (!clientId) {
      return new Response(JSON.stringify({ error: "GOOGLE_OAUTH_CLIENT_ID not configured" }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const guasto = identificativoSospetto(clientId, "gmail");
    if (guasto) {
      return new Response(JSON.stringify({ error: guasto }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: body.redirect_uri,
      response_type: "code",
      scope: GMAIL_SCOPES.join(" "),
      access_type: "offline",  // serve refresh token
      prompt: "consent",        // forza refresh_token anche su re-auth
      state,
    });
    authUrl = `${GMAIL_AUTH_URL}?${params.toString()}`;
  } else {
    const { clientId } = await getMsOAuthCredentials();
    if (!clientId) {
      return new Response(JSON.stringify({ error: "Credenziali Microsoft non configurate (MS_OAUTH_CLIENT_ID)" }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const guasto = identificativoSospetto(clientId, "outlook");
    if (guasto) {
      return new Response(JSON.stringify({ error: guasto }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: body.redirect_uri,
      response_type: "code",
      scope: OUTLOOK_SCOPES.join(" "),
      response_mode: "query",
      state,
    });
    authUrl = `${OUTLOOK_AUTH_URL}?${params.toString()}`;
  }

  return new Response(JSON.stringify({ auth_url: authUrl, state }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
