import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";

function buildEmailCopiaB2C(nome: string, data: string): string {
  return `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto">
  <h2 style="color:#1E3A5F">Documento firmato</h2>
  <p>Gentile ${nome},</p>
  <p>Hai firmato elettronicamente un documento il ${data}.</p>
  <p>Conserva questa email come prova della firma.</p>
</div>`;
}

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
    const {
      token,
      user_agent,
      lat,
      lng,
      b2c_recesso_accettato,
      b2c_clausole_approvate,
    } = body;

    if (!token) {
      return errore(400, "token obbligatorio");
    }

    // IP dal header
    const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? null;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Carica sigReq via token
    const { data: sigReq, error: fetchErr } = await supabaseAdmin
      .from("signature_requests")
      .select("id, status, tipo_firmatario, signer_email, signer_name, documento_hash, company_id, sessione_id, order_id, quote_id")
      .eq("token", token)
      .single();

    if (fetchErr || !sigReq) {
      return errore(404, "Richiesta di firma non trovata");
    }

    // Check: status deve essere otp_verified
    if (sigReq.status !== "otp_verified") {
      if (sigReq.status === "signed") {
        return errore(409, "Documento già firmato");
      }
      return errore(409, `Stato non valido per la firma: ${sigReq.status}. Verifica prima il codice OTP.`);
    }

    // Check B2C: recesso obbligatorio
    if (sigReq.tipo_firmatario === "b2c" && b2c_recesso_accettato === false) {
      return errore(400, "Il diritto di recesso deve essere accettato per procedere");
    }

    const ora = new Date().toISOString();

    // Costruisci updatePayload
    const updatePayload: Record<string, unknown> = {
      status: "signed",
      signed_at: ora,
      firma_ip: ip,
      firma_user_agent: user_agent ?? null,
      firma_lat: lat ?? null,
      firma_lng: lng ?? null,
    };

    // Per B2C
    if (sigReq.tipo_firmatario === "b2c") {
      updatePayload.b2c_recesso = b2c_recesso_accettato ?? true;
      updatePayload.b2c_recesso_ts = ora;
      updatePayload.b2c_clausole = b2c_clausole_approvate ?? null;
    }

    // Aggiorna signature_requests
    await supabaseAdmin
      .from("signature_requests")
      .update(updatePayload)
      .eq("id", sigReq.id);

    if (sigReq.quote_id) {
      const { error: quoteUpdateErr } = await supabaseAdmin
        .from("quotes")
        .update({
          status: "accettata",
          signed_at: ora,
          signed_by_name: sigReq.signer_name,
          updated_at: ora,
        })
        .eq("id", sigReq.quote_id)
        .eq("company_id", sigReq.company_id);

      if (quoteUpdateErr) {
        console.error("Quote FEA signed sync error:", quoteUpdateErr);
        // Rollback: la firma non può risultare completata se il preventivo
        // collegato non è stato aggiornato. Ripristina lo stato precedente.
        await supabaseAdmin
          .from("signature_requests")
          .update({ status: sigReq.status, signed_at: null })
          .eq("id", sigReq.id);
        return errore(500, "Errore nell'aggiornamento del preventivo collegato. La firma non è stata registrata: riprova tra qualche istante.");
      }
    }

    // Audit log firma_completata
    await supabaseAdmin.from("fea_audit_log").insert({
      request_id: sigReq.id,
      company_id: sigReq.company_id,
      evento: "firma_completata",
      ip,
      user_agent: user_agent ?? null,
      lat: lat ?? null,
      lng: lng ?? null,
      metadati: {
        tipo_firmatario: sigReq.tipo_firmatario,
        documento_hash: sigReq.documento_hash,
        b2c_recesso: sigReq.tipo_firmatario === "b2c" ? (b2c_recesso_accettato ?? true) : null,
      },
    });

    // Per B2C: invia email copia
    if (sigReq.tipo_firmatario === "b2c") {
      try {
        const dataFormattata = new Date(ora).toLocaleDateString("it-IT", {
          day: "2-digit",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });

        await sendEmailUnified({
          companyId:    sigReq.company_id,
          stream:       "transactional",
          to:           [sigReq.signer_email],
          subject:      "Copia del documento firmato",
          html:         buildEmailCopiaB2C(sigReq.signer_name, dataFormattata),
          templateName: "fea_firma_completata",
          skipCredits:  true,
          adminClient:  supabaseAdmin,
          metadata:     { request_id: sigReq.id, signer_email: sigReq.signer_email },
        });

        // Aggiorna b2c_email_copia=true
        await supabaseAdmin
          .from("signature_requests")
          .update({ b2c_email_copia: true })
          .eq("id", sigReq.id);

        // Audit log email_copia_inviata
        await supabaseAdmin.from("fea_audit_log").insert({
          request_id: sigReq.id,
          company_id: sigReq.company_id,
          evento: "email_copia_inviata",
          metadati: { signer_email: sigReq.signer_email },
        });
      } catch (emailErr) {
        console.error("Email copia B2C error:", emailErr);
        // Non blocchiamo la firma per un errore email
      }
    }

    return new Response(
      JSON.stringify({ success: true, firma_timestamp: ora }),
      { status: 200, headers: { ...corsH, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("fea-completa-firma error:", err);
    return new Response(
      JSON.stringify({ error: "Errore interno del server" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
