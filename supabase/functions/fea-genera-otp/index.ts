import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { loadProviderSettings, sendViaProvider } from "../_shared/emailProvider.ts";
import { getBrandingForCompany } from "../_shared/getBranding.ts";

function buildOTPEmail(otp: string, nome: string, azienda: string, link: string): string {
  return `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto">
  <h2 style="color:#1E3A5F">Codice di verifica per la firma</h2>
  <p>Gentile ${nome},</p>
  <p>${azienda} ti ha inviato un documento da firmare.</p>
  <p>Il tuo codice OTP (valido 10 minuti):</p>
  <div style="font-size:40px;font-weight:bold;letter-spacing:12px;color:#1E3A5F;padding:20px;background:#F1F5F9;border-radius:8px;text-align:center">${otp}</div>
  <p><a href="${link}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#F97316;color:white;border-radius:6px;text-decoration:none;font-weight:bold">Apri il documento</a></p>
  <p style="color:#64748B;font-size:12px">Se non hai richiesto questa firma, ignora questa email.</p>
</div>`;
}

Deno.serve(async (req: Request) => {
  const corsH = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsH });
  }

  try {
    const body = await req.json();
    const { request_id, azienda_nome } = body;

    if (!request_id) {
      return new Response(
        JSON.stringify({ error: "request_id obbligatorio" }),
        { status: 400, headers: { ...corsH, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Carica signature_request
    const { data: sigReq, error: fetchErr } = await supabaseAdmin
      .from("signature_requests")
      .select("id, token, signer_email, signer_name, status, expires_at, otp_tentativi, company_id")
      .eq("id", request_id)
      .single();

    if (fetchErr || !sigReq) {
      return new Response(
        JSON.stringify({ error: "Richiesta di firma non trovata" }),
        { status: 404, headers: { ...corsH, "Content-Type": "application/json" } }
      );
    }

    // Check: già firmato
    if (sigReq.status === "signed") {
      return new Response(
        JSON.stringify({ error: "Documento già firmato" }),
        { status: 409, headers: { ...corsH, "Content-Type": "application/json" } }
      );
    }

    // Check: troppi tentativi (≥10)
    if (sigReq.otp_tentativi >= 10) {
      return new Response(
        JSON.stringify({ error: "Troppi tentativi. Contatta l'azienda per un nuovo link." }),
        { status: 429, headers: { ...corsH, "Content-Type": "application/json" } }
      );
    }

    // Check: link scaduto
    if (new Date(sigReq.expires_at) < new Date()) {
      await supabaseAdmin
        .from("signature_requests")
        .update({ status: "expired" })
        .eq("id", request_id);
      return new Response(
        JSON.stringify({ error: "Link di firma scaduto" }),
        { status: 410, headers: { ...corsH, "Content-Type": "application/json" } }
      );
    }

    // Genera OTP 6 cifre
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Scadenza OTP: 10 minuti
    const otpScadenza = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    // Hash SHA-256
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      encoder.encode(otp + sigReq.id)
    );
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const otpHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    // Aggiorna otp_hash, otp_scadenza, status
    await supabaseAdmin
      .from("signature_requests")
      .update({
        otp_hash: otpHash,
        otp_scadenza: otpScadenza,
        status: "pending",
      })
      .eq("id", request_id);

    // Link firma — usa la nuova route /firma-fea/:token
    const branding = await getBrandingForCompany(supabaseAdmin, sigReq.company_id);
    const firmaLink = `${branding.siteUrl}/firma-fea/${sigReq.token}`;
    const brandName = azienda_nome ?? branding.platformName;

    // Invia email OTP
    try {
      const emailSettings = await loadProviderSettings("transactional");
      await sendViaProvider(emailSettings, {
        from: emailSettings.fromDefault,
        to: [sigReq.signer_email],
        subject: `Codice OTP per la firma — ${brandName}`,
        html: buildOTPEmail(otp, sigReq.signer_name, brandName, firmaLink),
      });
    } catch (emailErr) {
      console.error("Email send error:", emailErr);
      // Non blocchiamo: OTP aggiornato, email fallita
    }

    // Audit log
    await supabaseAdmin.from("fea_audit_log").insert({
      request_id,
      company_id: sigReq.company_id,
      evento: "otp_inviato",
      metadati: { signer_email: sigReq.signer_email },
    });

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsH, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("fea-genera-otp error:", err);
    return new Response(
      JSON.stringify({ error: "Errore interno del server" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
