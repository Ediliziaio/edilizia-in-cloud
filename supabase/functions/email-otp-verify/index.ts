// ============================================================================
// email-otp-verify — Verifica codice OTP e ritorna token_hash per session
// ============================================================================
// Input:  { email: string, code: string }
// Output:
//   { status: 'ok', token_hash: string, email: string } → frontend chiama
//         supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })
//   { status: 'invalid_code' | 'expired' | 'too_many_attempts' | 'no_active_code' }
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  let payload: { email?: string; code?: string };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const email = (payload.email ?? "").trim().toLowerCase();
  const code = (payload.code ?? "").trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({ error: "Email non valida" }, 400);
  }
  if (!/^\d{6}$/.test(code)) {
    return jsonResponse({ status: "invalid_code", error: "Codice deve essere 6 cifre" });
  }

  const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // 1. Verifica codice via RPC atomica
  const { data: verifyData, error: verifyErr } = await supa.rpc("consume_email_otp" as never, {
    p_email: email,
    p_code: code,
  } as never);
  if (verifyErr) {
    console.error("[email-otp-verify] consume_email_otp error:", verifyErr);
    return jsonResponse({ error: "Errore verifica" }, 500);
  }

  const result = verifyData as unknown as { status: string; attempts_left?: number };
  if (result.status !== "ok") {
    return jsonResponse(result);
  }

  // 2. Genera magic link e estrae token_hash (per autenticazione client-side)
  const { data: linkData, error: linkErr } = await supa.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr || !linkData) {
    console.error("[email-otp-verify] generateLink error:", linkErr);
    return jsonResponse({ error: "Impossibile generare sessione" }, 500);
  }

  // Il properties.hashed_token può essere verificato lato client con verifyOtp
  const tokenHash = (linkData.properties as { hashed_token?: string } | undefined)?.hashed_token;
  if (!tokenHash) {
    console.error("[email-otp-verify] hashed_token mancante in generateLink response");
    return jsonResponse({ error: "Sessione non generata" }, 500);
  }

  return jsonResponse({
    status: "ok",
    token_hash: tokenHash,
    email,
  });
});
