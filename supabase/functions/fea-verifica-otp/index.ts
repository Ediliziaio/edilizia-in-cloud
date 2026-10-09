import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { erroreStatoFirma, variantiTokenFirma } from "../_shared/statoFirma.ts";

Deno.serve(async (req: Request) => {
  const corsH = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsH });
  }

  const errore = (status: number, message: string) =>
    new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsH, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json();
    const { token, otp } = body;

    const varianti = variantiTokenFirma(token);
    if (!varianti.length || typeof otp !== "string" || !/^\d{6}$/.test(otp)) {
      return errore(400, "token e otp obbligatori");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Carica signature_request via token
    const { data: sigReq, error: fetchErr } = await supabaseAdmin
      .from("signature_requests")
      .select("id, otp_hash, otp_scadenza, otp_tentativi, status, expires_at, company_id")
      .in("token", varianti).order("created_at", { ascending: false }).limit(1)
      .maybeSingle();

    if (fetchErr || !sigReq) {
      return errore(404, "Link di firma non trovato");
    }
    const statoNonValido = erroreStatoFirma(sigReq);
    if (statoNonValido) return errore(statoNonValido.status, statoNonValido.error);

    // Check: otp_scadenza scaduta
    if (!sigReq.otp_hash || !sigReq.otp_scadenza || !Number.isFinite(Date.parse(sigReq.otp_scadenza)) || Date.parse(sigReq.otp_scadenza) <= Date.now()) {
      return errore(410, "Codice OTP scaduto. Richiedi un nuovo codice.");
    }

    // Check: troppi tentativi ≥5
    if (sigReq.otp_tentativi >= 5) {
      return errore(429, "Troppi tentativi errati. Richiedi un nuovo codice OTP.");
    }

    // Calcola hash SHA-256 di (otp + sigReq.id)
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      encoder.encode(otp + sigReq.id)
    );
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const computedHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    // Verifica hash
    if (computedHash !== sigReq.otp_hash) {
      // Incrementa tentativi
      const { data: tentativo, error: tentativoErr } = await supabaseAdmin
        .from("signature_requests")
        .update({ otp_tentativi: sigReq.otp_tentativi + 1 })
        .eq("id", sigReq.id).eq("status", sigReq.status).eq("otp_hash", sigReq.otp_hash)
        .eq("otp_tentativi", sigReq.otp_tentativi).gt("expires_at", new Date().toISOString())
        .select("id").maybeSingle();
      if (tentativoErr) return errore(500, "Verifica non registrata. Riprova tra qualche istante.");
      if (!tentativo) return errore(409, "Il codice o la richiesta sono cambiati. Riprova con il codice più recente.");

      // Audit log fallito
      await supabaseAdmin.from("fea_audit_log").insert({
        request_id: sigReq.id,
        company_id: sigReq.company_id,
        evento: "otp_fallito",
        ip: (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null,
        user_agent: req.headers.get("user-agent") ?? null,
        metadati: { tentativo: sigReq.otp_tentativi + 1 },
      });

      const rimanenti = Math.max(0, 5 - (sigReq.otp_tentativi + 1));
      return new Response(
        JSON.stringify({ error: "Codice OTP non corretto", tentativi_rimanenti: rimanenti }),
        { status: 401, headers: { ...corsH, "Content-Type": "application/json" } }
      );
    }

    // Hash corrisponde: aggiorna status a otp_verified
    const { data: verificata, error: verificaErr } = await supabaseAdmin
      .from("signature_requests")
      .update({ status: "otp_verified" })
      .eq("id", sigReq.id).eq("status", sigReq.status).eq("otp_hash", sigReq.otp_hash)
      .eq("otp_tentativi", sigReq.otp_tentativi).gt("expires_at", new Date().toISOString())
      .gt("otp_scadenza", new Date().toISOString()).select("id").maybeSingle();
    if (verificaErr) return errore(500, "Verifica non registrata. Riprova tra qualche istante.");
    if (!verificata) return errore(409, "Il codice o la richiesta sono cambiati. Riprova con il codice più recente.");

    // Audit log verificato
    await supabaseAdmin.from("fea_audit_log").insert({
      request_id: sigReq.id,
      company_id: sigReq.company_id,
      evento: "otp_verificato",
      ip: (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null,
      user_agent: req.headers.get("user-agent") ?? null,
    });

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsH, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("fea-verifica-otp error:", err);
    return new Response(
      JSON.stringify({ error: "Errore interno del server" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
