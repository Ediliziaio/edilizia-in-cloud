import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { getBrandingForCompany } from "../_shared/getBranding.ts";
import { inviaSmsCodiceFirma } from "../_shared/inviaSmsFirma.ts";
import { erroreStatoFirma, nuovoCodiceFirma, variantiTokenFirma } from "../_shared/statoFirma.ts";

const esc = (v: string) => v.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function buildOTPEmail(otp: string, nome: string, azienda: string, link: string): string {
  return `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto">
  <h2 style="color:#1E3A5F">Codice di verifica per la firma</h2>
  <p>Gentile ${esc(nome)},</p>
  <p>${esc(azienda)} ti ha inviato un documento da firmare.</p>
  <p>Il tuo codice OTP (valido 10 minuti):</p>
  <div style="font-size:40px;font-weight:bold;letter-spacing:12px;color:#1E3A5F;padding:20px;background:#F1F5F9;border-radius:8px;text-align:center">${otp}</div>
  <p><a href="${esc(link)}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#F97316;color:white;border-radius:6px;text-decoration:none;font-weight:bold">Apri il documento</a></p>
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
    const { request_id, token } = body;
    const varianti = variantiTokenFirma(token);

    if (typeof request_id !== "string" || !request_id || !varianti.length) {
      return new Response(
        JSON.stringify({ error: "request_id e token obbligatori" }),
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
      .select("id, token, signer_email, signer_name, signer_phone, status, expires_at, otp_hash, otp_scadenza, otp_tentativi, otp_canale, company_id")
      .eq("id", request_id).in("token", varianti)
      .single();

    if (fetchErr || !sigReq) {
      return new Response(
        JSON.stringify({ error: "Richiesta di firma non trovata" }),
        { status: 404, headers: { ...corsH, "Content-Type": "application/json" } }
      );
    }
    const statoNonValido = erroreStatoFirma(sigReq);
    if (statoNonValido) return new Response(JSON.stringify({ error: statoNonValido.error }), {
      status: statoNonValido.status, headers: { ...corsH, "Content-Type": "application/json" },
    });

    // Check: troppi tentativi (≥10)
    if (sigReq.otp_tentativi >= 10) {
      return new Response(
        JSON.stringify({ error: "Troppi tentativi. Contatta l'azienda per un nuovo link." }),
        { status: 429, headers: { ...corsH, "Content-Type": "application/json" } }
      );
    }

    // Un codice è appena partito (meno di un minuto fa): non se ne manda un altro.
    // Evita le raffiche di email e, soprattutto, di SMS a carico dell'azienda.
    if (sigReq.otp_hash && sigReq.otp_scadenza && new Date(sigReq.otp_scadenza).getTime() > Date.now() + 9 * 60 * 1000) {
      // Il canale è NOT NULL: la conferma di consegna del codice corrente
      // viene dall'audit, non da un valore nullo non ammesso dallo schema.
      const { data: consegna } = await supabaseAdmin.from("fea_audit_log")
        .select("metadati").eq("request_id", sigReq.id).eq("evento", "otp_inviato")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (consegna?.metadati?.otp_hash !== sigReq.otp_hash) return new Response(JSON.stringify({ error: "Invio del codice in corso. Attendi qualche istante e riprova." }), {
        status: 409, headers: { ...corsH, "Content-Type": "application/json" },
      });
      return new Response(
        JSON.stringify(sigReq.otp_tentativi >= 5
          ? { error: "Attendi un minuto dall'ultimo invio prima di richiedere un nuovo codice." }
          : { success: true, gia_inviato: true, sms_inviato: sigReq.otp_canale === "sms" }),
        { status: sigReq.otp_tentativi >= 5 ? 429 : 200, headers: { ...corsH, "Content-Type": "application/json" } }
      );
    }

    // Genera OTP 6 cifre
    const otp = nuovoCodiceFirma();

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
    let salva = supabaseAdmin
      .from("signature_requests")
      .update({
        otp_hash: otpHash,
        otp_scadenza: otpScadenza,
        status: "pending",
        otp_tentativi: 0,
      })
      .eq("id", request_id).eq("status", sigReq.status)
      .eq("otp_tentativi", sigReq.otp_tentativi).gt("expires_at", new Date().toISOString());
    salva = sigReq.otp_hash == null ? salva.is("otp_hash", null) : salva.eq("otp_hash", sigReq.otp_hash);
    const { data: salvata, error: salvaErr } = await salva.select("id").maybeSingle();
    if (salvaErr || !salvata) return new Response(JSON.stringify({ error: "Codice non generato: la richiesta è cambiata o il salvataggio non è riuscito. Riprova." }), {
      status: salvaErr ? 500 : 409, headers: { ...corsH, "Content-Type": "application/json" },
    });

    // Link firma — usa la nuova route /firma-fea/:token
    const branding = await getBrandingForCompany(supabaseAdmin, sigReq.company_id);
    const firmaLink = `${branding.siteUrl}/firma-fea/${sigReq.token}`;
    const { data: azienda } = await supabaseAdmin.from("companies").select("name").eq("id", sigReq.company_id).maybeSingle();
    const brandName = azienda?.name ?? branding.platformName;

    // Invia email OTP
    let emailInviata = false;
    try {
      const invio = await sendEmailUnified({
        companyId:    sigReq.company_id,
        stream:       "transactional",
        to:           [sigReq.signer_email],
        subject:      `Codice OTP per la firma — ${brandName}`,
        html:         buildOTPEmail(otp, sigReq.signer_name, brandName, firmaLink),
        templateName: "fea_otp",
        skipCredits:  true,
        adminClient:  supabaseAdmin,
        metadata:     { request_id: sigReq.id, signer_email: sigReq.signer_email },
      });
      emailInviata = invio.ok;
    } catch (emailErr) {
      console.error("Email send error:", emailErr);
      // Si può proseguire soltanto se almeno il canale SMS riesce.
    }

    // SMS in più, se c'è il cellulare e l'azienda ha credito: senza, resta l'email.
    let smsInviato = false;
    let smsMotivo: string | undefined;
    if (sigReq.signer_phone) {
      const esito = await inviaSmsCodiceFirma(supabaseAdmin, {
        companyId: sigReq.company_id, richiestaId: sigReq.id, to: sigReq.signer_phone, otp, aziendaNome: brandName,
      });
      smsInviato = esito.inviato;
      smsMotivo = esito.motivo;
    }
    if (!emailInviata && !smsInviato) {
      await supabaseAdmin.from("signature_requests")
        .update({ otp_hash: null, otp_scadenza: null })
        .eq("id", request_id).eq("status", "pending").eq("otp_hash", otpHash);
      return new Response(JSON.stringify({ error: "Non riesco a inviare il codice né via email né via SMS. Riprova tra qualche istante." }), {
        status: 502, headers: { ...corsH, "Content-Type": "application/json" },
      });
    }
    await supabaseAdmin.from("signature_requests").update({ otp_canale: smsInviato ? "sms" : "email" })
      .eq("id", request_id).eq("otp_hash", otpHash);

    // Audit log
    await supabaseAdmin.from("fea_audit_log").insert({
      request_id,
      company_id: sigReq.company_id,
      evento: "otp_inviato",
      metadati: { signer_email: sigReq.signer_email, otp_hash: otpHash, canali: [...(emailInviata ? ["email"] : []), ...(smsInviato ? ["sms"] : [])], sms_non_inviato: sigReq.signer_phone && !smsInviato ? smsMotivo ?? null : undefined },
    });

    return new Response(
      JSON.stringify({ success: true, sms_inviato: smsInviato }),
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
