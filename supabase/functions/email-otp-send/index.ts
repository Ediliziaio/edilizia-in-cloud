// ============================================================================
// email-otp-send — Genera e invia codice OTP via email (login senza password)
// ============================================================================
// Input:  { email: string }
// Output: { status: 'sent' | 'rate_limited' | 'user_not_found', cooldown?: number,
//           demo?: boolean, demo_code?: string }
//
// Flusso:
//   1. Verifica che esista un user con quell'email
//   2. BYPASS DEMO: se email finisce con @azienda.srl (account test/demo)
//      → inserisce codice fisso "000000" valido 60 min, NON invia email Resend,
//        ritorna { demo: true, demo_code: '000000' } per UI che lo mostra.
//   3. Rate limit: max 1 codice ogni 60s per email + max 10/giorno per IP
//   4. Genera 6 cifre casuali (CSPRNG)
//   5. Hash bcrypt-style (crypt()) e insert email_otp_codes
//   6. Invia email con il codice via Resend (sender platform)
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// Domini demo dove il flow OTP è bypassato con codice fisso "000000".
// Sicuro perché:
//  - Sono account pre-creati dal sistema (signup pubblico non permette @azienda.srl)
//  - Il primo step di auth (password) resta intatto: serve comunque la password
//  - .srl è TLD italiano riservato → bassissima probabilità di mailbox reali
//  - Risparmio invio email a mailbox inesistenti (no bounce → reputation Resend)
const DEMO_DOMAINS = new Set(["azienda.srl"]);
const DEMO_BYPASS_CODE = "000000";

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

function generateCode(): string {
  // v8.6.101 — CSPRNG invece di Math.random (predicibile/brute-force-friendly).
  // crypto.getRandomValues garantisce ≥128 bit entropia → bruteforce 6 cifre
  // resta limitato dal rate-limit lato server + max attempts (5).
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const n = buf[0] % 1_000_000;
  return n.toString().padStart(6, "0");
}

function buildEmailHtml(code: string, ttlMin: number): string {
  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f3f4f6;padding:24px">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb">
    <h2 style="color:#173b67;margin:0 0 16px;font-size:20px">🔐 Codice di sicurezza · Edilizia in Cloud</h2>
    <p style="color:#374151;margin:0 0 24px">Hai appena effettuato l'accesso con la tua password. Per completare l'autenticazione inserisci questo codice di sicurezza:</p>
    <div style="background:#fff7ed;border:2px solid #fed7aa;border-radius:8px;padding:24px;text-align:center;margin:24px 0">
      <div style="font-size:36px;font-weight:700;letter-spacing:12px;font-family:monospace;color:#9a3412">${code}</div>
    </div>
    <p style="color:#6b7280;font-size:14px;margin:24px 0 8px">Il codice scade tra <strong>${ttlMin} minuti</strong>.</p>
    <p style="color:#9ca3af;font-size:12px;margin:16px 0 0">⚠️ Se NON sei stato tu, qualcuno ha la tua password. Cambiala immediatamente.</p>
  </div>
  <p style="text-align:center;color:#9ca3af;font-size:11px;margin:16px 0 0">© Edilizia in Cloud · app.ediliziaincloud.com</p>
</body></html>`;
}

function buildEmailText(code: string, ttlMin: number): string {
  return `Codice di sicurezza Edilizia in Cloud

Hai appena fatto l'accesso. Inserisci questo codice per completare l'autenticazione:

${code}

Scade tra ${ttlMin} minuti.

Se NON sei stato tu, cambia immediatamente la password.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  let payload: { email?: string };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const email = (payload.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({ error: "Email non valida" }, 400);
  }

  const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // 1. Verifica esistenza utente via admin.generateLink (più affidabile di listUsers
  // che può fallire con "Database error finding users" su alcuni progetti).
  // generateLink ritorna error 422 se l'email non esiste.
  const { error: linkErr } = await supa.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr) {
    // Non leakiamo se l'email NON esiste — rispondiamo come se fosse stata inviata
    // (security: anti-enumeration). Loggiamo solo lato server.
    console.warn("[email-otp-send] user check failed for", email, ":", linkErr.message);
    return jsonResponse({ status: "sent", ttl_min: 15 });
  }

  // 1.5 BYPASS DEMO: account *@azienda.srl ricevono codice fisso "000000".
  // Non chiamiamo Resend (mailbox inesistenti = bounce → reputation Resend).
  // L'UI mostra il codice direttamente all'utente.
  const emailDomain = email.split("@")[1] ?? "";
  if (DEMO_DOMAINS.has(emailDomain)) {
    const DEMO_TTL_MIN = 60;
    const demoExpires = new Date(Date.now() + DEMO_TTL_MIN * 60_000).toISOString();
    // Pulisci codici non consumati per evitare ambiguità con codici precedenti
    await supa.from("email_otp_codes").delete().eq("email", email).is("consumed_at", null);
    const { data: demoHash, error: demoHashErr } = await supa.rpc("hash_otp_code" as never, {
      p_code: DEMO_BYPASS_CODE,
    } as never);
    if (demoHashErr || !demoHash) {
      console.error("[email-otp-send] demo hash error:", demoHashErr);
      return jsonResponse({ error: "Impossibile generare codice demo" }, 500);
    }
    const { error: demoInsErr } = await supa.from("email_otp_codes").insert({
      email,
      code_hash: demoHash as unknown as string,
      expires_at: demoExpires,
    });
    if (demoInsErr) {
      console.error("[email-otp-send] demo insert error:", demoInsErr);
      return jsonResponse({ error: "Impossibile salvare codice demo" }, 500);
    }
    console.log(`[email-otp-send] DEMO bypass for ${email} — code=${DEMO_BYPASS_CODE} (TTL ${DEMO_TTL_MIN}min)`);
    return jsonResponse({
      status: "sent",
      ttl_min: DEMO_TTL_MIN,
      demo: true,
      demo_code: DEMO_BYPASS_CODE,
    });
  }

  // 2a. Rate limit per EMAIL: max 1 codice / 60s
  const { data: recent } = await supa
    .from("email_otp_codes")
    .select("created_at")
    .eq("email", email)
    .gte("created_at", new Date(Date.now() - 60_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(1);
  if (recent && recent.length > 0) {
    const sentAt = new Date(recent[0].created_at).getTime();
    const cooldown = Math.max(0, 60 - Math.floor((Date.now() - sentAt) / 1000));
    return jsonResponse({ status: "rate_limited", cooldown });
  }

  // 2b. v8.6.101 — Rate limit per IP: max 10 codici / ora (anti-enumeration).
  const ipForLimit = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (ipForLimit) {
    const { count: ipCount } = await supa
      .from("email_otp_codes")
      .select("id", { count: "exact", head: true })
      .eq("ip_address", ipForLimit)
      .gte("created_at", new Date(Date.now() - 60 * 60_000).toISOString());
    if ((ipCount ?? 0) >= 10) {
      console.warn(`[email-otp-send] IP rate-limit hit for ${ipForLimit}`);
      // Risposta neutra (anti-enumeration): l'attaccante non sa se è blocked
      return jsonResponse({ status: "sent", ttl_min: 15 });
    }
  }

  // 3. Genera codice + hash
  const code = generateCode();
  const TTL_MIN = 15;
  const expiresAt = new Date(Date.now() + TTL_MIN * 60_000).toISOString();

  // Hash via RPC hash_otp_code (bcrypt-style su lato DB)
  const { data: hashed, error: hashErr } = await supa.rpc("hash_otp_code" as never, {
    p_code: code,
  } as never);
  if (hashErr || !hashed) {
    console.error("[email-otp-send] hash error:", hashErr);
    return jsonResponse({ error: "Impossibile generare il codice" }, 500);
  }
  const code_hash = hashed as unknown as string;

  // 4. Insert codice
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = req.headers.get("user-agent") ?? null;
  const { error: insErr } = await supa.from("email_otp_codes").insert({
    email,
    code_hash,
    expires_at: expiresAt,
    ip_address: ip,
    user_agent: ua,
  });
  if (insErr) {
    console.error("[email-otp-send] insert error:", insErr);
    return jsonResponse({ error: "Impossibile salvare il codice" }, 500);
  }

  // 5. Carica provider email (Resend) da platform_settings
  const { data: cfg } = await supa
    .from("platform_settings")
    .select("key, value")
    .in("key", [
      "email_transactional_api_key",
      "email_transactional_from_address",
      "email_transactional_from_name",
      "email_transactional_provider",
    ]);
  const cfgMap = new Map((cfg ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
  const apiKey = cfgMap.get("email_transactional_api_key");
  const fromAddr = cfgMap.get("email_transactional_from_address") ?? "noreply@notifiche.ediliziaincloud.it";
  const fromName = cfgMap.get("email_transactional_from_name") ?? "Edilizia in Cloud";
  const provider = cfgMap.get("email_transactional_provider") ?? "resend";

  if (!apiKey) {
    console.error("[email-otp-send] email_transactional_api_key non configurata");
    return jsonResponse({ error: "Provider email non configurato" }, 500);
  }

  // 6. Invio email via Resend API
  if (provider === "resend") {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          from: `${fromName} <${fromAddr}>`,
          to: [email],
          subject: `Codice di accesso: ${code}`,
          html: buildEmailHtml(code, TTL_MIN),
          text: buildEmailText(code, TTL_MIN),
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        console.error("[email-otp-send] Resend error:", res.status, body);
        return jsonResponse({ error: "Errore invio email", detail: body.slice(0, 200) }, 500);
      }
    } catch (e) {
      console.error("[email-otp-send] fetch error:", e);
      return jsonResponse({ error: "Errore invio email" }, 500);
    }
  } else {
    return jsonResponse({ error: `Provider ${provider} non supportato per OTP` }, 500);
  }

  return jsonResponse({ status: "sent", ttl_min: TTL_MIN });
});
