import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
import { getBrandingForCompany } from "../_shared/getBranding.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsH = getCorsHeaders(req);
  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);
    const {
      quote_id,
      recipient_email,
      recipient_name,
      custom_message,
      expires_days,
      // "solo_pdf": manda il preventivo in PDF via email, senza firma OTP.
      // Additivo: il flusso firma resta identico quando mode e' assente.
      mode,
    } = await req.json();

    if (!quote_id) return errorResponse("quote_id richiesto");

    // Load quote
    const { data: quote, error: qErr } = await supabaseAdmin
      .from("quotes")
      .select("*")
      .eq("id", quote_id)
      .single();
    if (qErr || !quote) return errorResponse("Preventivo non trovato", 404);

    // Verify user belongs to company
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();
    if (!profile || profile.company_id !== quote.company_id) {
      return errorResponse("Non autorizzato", 403);
    }

    // Determine recipient
    const finalEmail = recipient_email || quote.client_email;
    const finalName = recipient_name || quote.client_name || "Cliente";

    if (!finalEmail) {
      return errorResponse("Il cliente non ha un indirizzo email");
    }

    // Calculate expires_at
    const daysValid = expires_days && expires_days > 0 ? expires_days : 30;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + daysValid);

    const nowIsoPdf = new Date().toISOString();

    // ── Modalita' "solo PDF": email col preventivo allegato, niente firma OTP ──
    if (mode === "solo_pdf") {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

      const pdfResp = await fetchWithTimeout(
        `${supabaseUrl}/functions/v1/generate-quote-pdf`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // generate-quote-pdf pretende il JWT dell'utente (requireAuth): la
            // service-role come Bearer veniva rifiutata e il PDF non nasceva mai.
            Authorization: req.headers.get("Authorization") ?? `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({ quote_id }),
        },
        60_000,
      );
      if (!pdfResp.ok) {
        return errorResponse("Generazione PDF non riuscita", 500);
      }
      const pdfJson = await pdfResp.json();
      if (!pdfJson?.signed_url) return errorResponse("PDF non disponibile", 500);
      const pdfBytes = new Uint8Array(await (await fetch(pdfJson.signed_url)).arrayBuffer());
      // btoa a blocchi: sui PDF grossi la conversione in un colpo solo sfora lo stack.
      let binario = "";
      const BLOCCO = 0x8000;
      for (let i = 0; i < pdfBytes.length; i += BLOCCO) {
        binario += String.fromCharCode(...pdfBytes.subarray(i, i + BLOCCO));
      }
      const pdfBase64 = btoa(binario);

      const { data: companyPdf } = await supabaseAdmin
        .from("companies")
        .select("name")
        .eq("id", quote.company_id)
        .single();
      const nomeAzienda = companyPdf?.name || "L'azienda";
      const totaleFmt = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" })
        .format(Number(quote.total || 0));

      const htmlSemplice = `
        <div style="font-family: Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #111827;">
          <p>Gentile ${finalName},</p>
          <p>in allegato trova il preventivo <strong>${quote.quote_number}</strong>${quote.title ? ` — ${quote.title}` : ""} per un totale di <strong>${totaleFmt}</strong>.</p>
          ${custom_message ? `<p style="white-space: pre-line;">${String(custom_message)}</p>` : ""}
          <p>Restiamo a disposizione per qualsiasi chiarimento.</p>
          <p>Cordiali saluti,<br/>${nomeAzienda}</p>
        </div>`;

      const invio = await sendEmailUnified({
        companyId:    quote.company_id,
        stream:       "transactional",
        to:           [finalEmail],
        subject:      `Preventivo ${quote.quote_number} — ${nomeAzienda}`,
        html:         htmlSemplice,
        templateName: "quote_pdf_semplice",
        skipCredits:  false,
        adminClient:  supabaseAdmin,
        metadata:     { quote_id: quote.id, quote_number: quote.quote_number, mode: "solo_pdf" },
        attachments:  [{
          filename: `Preventivo_${quote.quote_number}.pdf`,
          content: pdfBase64,
          type: "application/pdf",
        }],
      });
      if (!invio.ok) {
        return errorResponse(`Errore invio email: ${JSON.stringify(invio.body)}`, 500);
      }

      // Il preventivo risulta inviato (senza retrocedere uno gia' firmato)
      // e la scadenza parte da qui, cosi' reminder e cron la vedono.
      const patch: Record<string, unknown> = { updated_at: nowIsoPdf, client_email: finalEmail };
      if (quote.status === "bozza" || quote.status === "inviata") {
        patch.status = "inviata";
        patch.sent_at = quote.sent_at ?? nowIsoPdf;
        patch.expires_at = expiresAt.toISOString();
      }
      await supabaseAdmin.from("quotes").update(patch).eq("id", quote_id);

      return jsonResponse({ success: true, message: "Preventivo inviato in PDF", mode: "solo_pdf" });
    }

    const signatureToken = crypto.randomUUID().replace(/-/g, "");
    const tipoFirmatario = quote.client_company || quote.client_vat_number ? "b2b" : "b2c";
    const nowIso = new Date().toISOString();

    // ── Il PDF che il cliente firma va congelato ADESSO: generato (o riusato,
    // per i moduli che lo caricano già pronto) e con impronta SHA-256 sulla
    // richiesta. Prima la pagina di firma FEA non aveva alcun PDF: si firmava
    // alla cieca.
    const supabaseUrlFirma = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKeyFirma = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const daModulo = typeof quote.source === "string" && quote.source.startsWith("modulo:");
    let pdfPathFirma: string | null = daModulo && typeof quote.pdf_storage_path === "string" ? quote.pdf_storage_path : null;
    if (!pdfPathFirma) {
      const pdfResp = await fetchWithTimeout(
        `${supabaseUrlFirma}/functions/v1/generate-quote-pdf`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: req.headers.get("Authorization") ?? `Bearer ${serviceRoleKeyFirma}` },
          body: JSON.stringify({ quote_id }),
        },
        60_000,
      );
      if (!pdfResp.ok) {
        return errorResponse("Generazione PDF non riuscita: controlla il preventivo e riprova", 500);
      }
      const pdfJson = await pdfResp.json();
      pdfPathFirma = typeof pdfJson?.pdf_path === "string" ? pdfJson.pdf_path : null;
      if (!pdfPathFirma) return errorResponse("PDF del preventivo non disponibile", 500);
    }
    let documentoHash: string | null = null;
    try {
      const { data: pdfFile } = await supabaseAdmin.storage.from("quote-pdfs").download(pdfPathFirma);
      if (pdfFile) {
        const digest = await crypto.subtle.digest("SHA-256", await pdfFile.arrayBuffer());
        documentoHash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
      }
    } catch (e) {
      console.warn("Impronta PDF non calcolata:", e);
    }

    // Una sola richiesta attiva per preventivo: le vecchie richieste aperte vengono annullate.
    const { error: cancelErr } = await supabaseAdmin
      .from("signature_requests")
      .update({ status: "cancelled", updated_at: nowIso })
      .eq("company_id", quote.company_id)
      .eq("quote_id", quote_id)
      .in("status", ["pending", "otp_verified"]);

    if (cancelErr) {
      console.error("Cancel previous quote signature requests failed:", cancelErr);
    }

    const { data: signatureRequest, error: sigReqErr } = await supabaseAdmin
      .from("signature_requests")
      .insert({
        company_id: quote.company_id,
        quote_id,
        token: signatureToken,
        signer_email: finalEmail,
        signer_name: finalName,
        status: "pending",
        expires_at: expiresAt.toISOString(),
        created_by: userId,
        tipo_documento: "quote",
        tipo_firmatario: tipoFirmatario,
        documento_hash: documentoHash,
      })
      .select("id, token")
      .single();

    if (sigReqErr || !signatureRequest) {
      console.error("Quote signature request creation failed:", sigReqErr);
      return errorResponse("Errore nella creazione della richiesta di firma FEA", 500);
    }

    // Update quote
    await supabaseAdmin
      .from("quotes")
      .update({
        status: "inviata",
        signature_token: signatureToken,
        sent_at: nowIso,
        expires_at: expiresAt.toISOString(),
        client_email: finalEmail,
        client_name: finalName,
        firma_digitale_abilitata: true,
        updated_at: nowIso,
      })
      .eq("id", quote_id);

    // Load company info
    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("name, logo_url")
      .eq("id", quote.company_id)
      .single();

    const branding = await getBrandingForCompany(supabaseAdmin, quote.company_id);
    const appUrl = await getPlatformSetting("site_url", "SITE_URL")
      || Deno.env.get("SITE_URL")
      || branding.siteUrl
      || "";
    const signatureLink = `${appUrl}/firma-fea/${signatureToken}`;
    const companyName = company?.name || "L'azienda";

    // Format total
    const formattedTotal = new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
    }).format(Number(quote.total || 0));

    const expiresFormatted = expiresAt.toLocaleDateString("it-IT", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    // Build email HTML
    const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <!-- Header -->
    <div style="background: #1e3a5f; border-radius: 12px 12px 0 0; padding: 32px 40px; text-align: center;">
      ${company?.logo_url ? `<img src="${company.logo_url}" alt="${companyName}" style="height: 48px; margin-bottom: 12px;" />` : ""}
      <h1 style="margin: 0; font-size: 22px; color: #ffffff; font-weight: 700;">${companyName}</h1>
      <p style="margin: 8px 0 0; color: rgba(255,255,255,0.75); font-size: 14px;">Offerta n. ${quote.quote_number}</p>
    </div>

    <!-- Body -->
    <div style="background: #ffffff; padding: 40px; border-left: 1px solid #e4e4e7; border-right: 1px solid #e4e4e7;">
      <p style="color: #3f3f46; line-height: 1.6; margin: 0 0 15px;">
        Gentile <strong>${finalName}</strong>,
      </p>
      <p style="color: #3f3f46; line-height: 1.6; margin: 0 0 15px;">
        Le inviamo la nostra offerta${quote.title ? ` per <strong>${quote.title}</strong>` : ""}.
        Potrà visualizzarla e firmarla online con codice OTP.
      </p>

      ${custom_message ? `
        <div style="background: #f8fafc; border-left: 3px solid #2563eb; padding: 12px 16px; margin: 20px 0; border-radius: 0 8px 8px 0;">
          <p style="color: #3f3f46; line-height: 1.6; margin: 0; font-size: 14px;">${custom_message}</p>
        </div>
      ` : ""}

      <!-- Amount box -->
      <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 10px; padding: 20px; text-align: center; margin: 25px 0;">
        <p style="color: #71717a; font-size: 13px; margin: 0 0 6px; text-transform: uppercase; letter-spacing: 0.5px;">Importo Totale</p>
        <p style="color: #1e3a5f; font-size: 28px; font-weight: 700; margin: 0;">${formattedTotal}</p>
      </div>

      <p style="color: #71717a; font-size: 13px; margin: 0 0 25px; text-align: center;">
        Offerta valida fino al <strong>${expiresFormatted}</strong>
      </p>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${signatureLink}" 
           style="display: inline-block; background: #2563eb; color: #ffffff; padding: 16px 40px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
          Visualizza e firma con OTP
        </a>
      </div>

      <p style="color: #a1a1aa; font-size: 12px; text-align: center; margin: 20px 0 0;">
        Oppure copia questo link nel browser:<br />
        <a href="${signatureLink}" style="color: #2563eb; word-break: break-all;">${signatureLink}</a>
      </p>
    </div>

    <!-- Footer -->
    <div style="background: #fafafa; border-radius: 0 0 12px 12px; padding: 20px 40px; border: 1px solid #e4e4e7; border-top: none; text-align: center;">
      <p style="color: #a1a1aa; font-size: 11px; margin: 0;">
        Questa email è stata inviata da ${companyName}${!branding.hidePoweredBy ? ` tramite ${branding.platformName}` : ""}.
      </p>
    </div>
  </div>
</body>
</html>`;

    // Genera subito l'OTP iniziale: il cliente può comunque rigenerarlo dalla pagina pubblica.
    let otpInviato = false;
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const otpRes = await fetchWithTimeout(`${supabaseUrl}/functions/v1/fea-genera-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ request_id: signatureRequest.id, azienda_nome: companyName }),
        timeoutMs: 15_000,
      });

      if (otpRes.ok) {
        otpInviato = true;
      } else {
        console.error("Quote FEA OTP generation failed:", await otpRes.text());
      }
    } catch (otpErr) {
      console.error("Quote FEA OTP call error:", otpErr);
    }

    await supabaseAdmin.from("fea_audit_log").insert({
      request_id: signatureRequest.id,
      company_id: quote.company_id,
      evento: "sessione_creata",
      metadati: { tipo_documento: "quote", signer_email: finalEmail, quote_id },
    });

    // Send email via unified pipeline (transactional stream)
    const result = await sendEmailUnified({
      companyId:    quote.company_id,
      stream:       "transactional",
      to:           [finalEmail],
      subject:      `Offerta ${quote.quote_number} — ${companyName}`,
      html:         emailHtml,
      templateName: "quote_signature",
      skipCredits:  false,
      adminClient:  supabaseAdmin,
      metadata:     { quote_id: quote.id, quote_number: quote.quote_number },
    });

    if (!result.ok) {
      console.error("Email send failed:", result);
      return errorResponse(`Errore invio email: ${JSON.stringify(result.body)}`, 500);
    }

    return jsonResponse({
      success: true,
      message: "Offerta inviata con successo",
      signature_link: signatureLink,
      signature_request_id: signatureRequest.id,
      otp_inviato: otpInviato,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("send-quote-signature error:", e);
    return errorResponse("Errore interno", 500);
  }
});
