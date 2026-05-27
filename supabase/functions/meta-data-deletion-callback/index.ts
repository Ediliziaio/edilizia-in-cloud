// ============================================================================
// meta-data-deletion-callback — Endpoint Meta Data Deletion Callback
// ============================================================================
// Riceve POST programmatici da Meta quando un utente revoca l'app dalle
// Impostazioni Facebook → Apps e siti web → "Rimuovi".
//
// Spec: https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback/
//
// Input (form-encoded body):
//   signed_request: <base64url HMAC-SHA256 firmato con app_secret>
//
// Output (JSON):
//   { url: "<status_page_url>", confirmation_code: "<unique_id>" }
//
// Flusso:
//   1. Decodifica signed_request con HMAC-SHA256 (key = meta_app_secret)
//   2. Estrae user_id Facebook
//   3. Inserisce riga in meta_data_deletion_requests con confirmation_code univoco
//   4. (TODO async): job batch anonimizza dati associati a quel user_id
//   5. Restituisce URL pagina status + confirmation_code (visibile su Facebook)
//
// SICUREZZA: l'edge function NON richiede JWT (è chiamata server-to-server da
// Meta). La verifica HMAC garantisce che la richiesta venga davvero da Meta.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const STATUS_PAGE_BASE = "https://app.ediliziaincloud.com/data-deletion";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/**
 * Decodifica base64url (variante di base64 usata da Meta nei signed_request).
 * Sostituisce -/_ con +/ e aggiunge padding =.
 */
function base64UrlDecode(input: string): Uint8Array {
  let b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Verifica HMAC-SHA256 del signed_request usando l'app_secret.
 * Spec: https://developers.facebook.com/docs/games/gamesonfacebook/login#parsingsr
 *
 * signed_request format: <signature_b64url>.<payload_b64url>
 * - signature: HMAC-SHA256(payload, app_secret)
 * - payload: JSON con { algorithm, issued_at, user_id }
 */
async function verifySignedRequest(
  signedRequest: string,
  appSecret: string,
): Promise<{ user_id: string; algorithm: string; issued_at: number } | null> {
  const parts = signedRequest.split(".");
  if (parts.length !== 2) return null;
  const [signatureB64, payloadB64] = parts;

  // Decodifica payload
  let payload: { algorithm?: string; issued_at?: number; user_id?: string };
  try {
    const payloadBytes = base64UrlDecode(payloadB64);
    payload = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    return null;
  }
  if (payload.algorithm !== "HMAC-SHA256" || !payload.user_id) return null;

  // Verifica HMAC
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const expectedSig = base64UrlDecode(signatureB64);
  const isValid = await crypto.subtle.verify(
    "HMAC",
    key,
    expectedSig,
    new TextEncoder().encode(payloadB64),
  );
  if (!isValid) return null;

  return {
    user_id: payload.user_id,
    algorithm: payload.algorithm,
    issued_at: payload.issued_at ?? Math.floor(Date.now() / 1000),
  };
}

/** Genera confirmation_code univoco e leggibile (16 char hex). */
function generateConfirmationCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  // GET = pagina di status per check confirmation_code (chiamata dall'utente
  // o da Meta per verificare lo stato della richiesta).
  if (req.method === "GET") {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    if (!code) {
      return jsonResponse({ error: "Missing code parameter" }, 400);
    }
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return jsonResponse({ error: "Server misconfigured" }, 500);
    }
    const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const { data } = await supa
      .from("meta_data_deletion_requests")
      .select("status, created_at, completed_at")
      .eq("confirmation_code", code)
      .maybeSingle();
    if (!data) {
      return jsonResponse({ status: "not_found" }, 404);
    }
    return jsonResponse({
      confirmation_code: code,
      status: data.status,
      requested_at: data.created_at,
      completed_at: data.completed_at,
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // 1. Carica app_secret da platform_settings (mai esposto al client)
  const { data: settings } = await supa
    .from("platform_settings")
    .select("key, value")
    .eq("key", "meta_app_secret")
    .maybeSingle();
  const appSecret = settings?.value;
  if (!appSecret) {
    console.error("[meta-data-deletion-callback] meta_app_secret non configurato");
    return jsonResponse({ error: "App secret not configured" }, 500);
  }

  // 2. Estrai signed_request dal body (form-encoded o JSON)
  let signedRequest: string | null = null;
  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      signedRequest = formData.get("signed_request")?.toString() ?? null;
    } else if (contentType.includes("application/json")) {
      const body = await req.json();
      signedRequest = body?.signed_request ?? null;
    } else {
      // Meta tipicamente invia form-encoded — fallback parse raw body
      const text = await req.text();
      const params = new URLSearchParams(text);
      signedRequest = params.get("signed_request");
    }
  } catch (e) {
    console.error("[meta-data-deletion-callback] body parse error:", e);
    return jsonResponse({ error: "Invalid body" }, 400);
  }

  if (!signedRequest) {
    return jsonResponse({ error: "Missing signed_request" }, 400);
  }

  // 3. Verifica HMAC e estrae user_id
  const verified = await verifySignedRequest(signedRequest, appSecret);
  if (!verified) {
    console.error("[meta-data-deletion-callback] HMAC verification failed");
    return jsonResponse({ error: "Invalid signature" }, 400);
  }

  // 4. Insert richiesta nel DB con confirmation_code univoco
  const confirmationCode = generateConfirmationCode();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = req.headers.get("user-agent") ?? null;

  // Lookup email associata: cerca user con metadata.facebook_user_id corrispondente
  // (best-effort: se non trovata, la richiesta resta in status manual_review).
  let associatedEmail: string | null = null;
  try {
    const { data: users } = await supa.auth.admin.listUsers({ perPage: 1, page: 1 });
    // Note: in produzione conviene avere un indice su user_metadata->>'facebook_user_id'
    // per lookup veloce. Per ora MVP: registriamo la richiesta e processiamo
    // in async via job batch.
    if (users) {
      // Skip lookup intensivo: il batch job giornaliero risolverà.
    }
  } catch {
    /* ignore — lookup è best-effort */
  }

  const { error: insErr } = await supa.from("meta_data_deletion_requests").insert({
    facebook_user_id: verified.user_id,
    confirmation_code: confirmationCode,
    status: "pending",
    associated_email: associatedEmail,
    signed_request_raw: signedRequest.slice(0, 500), // tronca per audit
    ip_address: ip,
    user_agent: ua,
  });

  if (insErr) {
    console.error("[meta-data-deletion-callback] insert error:", insErr);
    return jsonResponse({ error: "Failed to log request" }, 500);
  }

  console.warn(
    `[meta-data-deletion-callback] Richiesta cancellazione ricevuta: ` +
    `fb_user_id=${verified.user_id} confirmation_code=${confirmationCode}`,
  );

  // 5. Risposta a Meta secondo spec: URL pagina status + confirmation_code
  const statusUrl = `${STATUS_PAGE_BASE}?code=${confirmationCode}`;
  return jsonResponse({
    url: statusUrl,
    confirmation_code: confirmationCode,
  });
});
