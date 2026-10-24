import { normalizzaTelefonoE164 } from "../_shared/telefonoE164.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { preventivoModificabile, preventivoVisibile, type ClienteDiChiChiama, type ClienteRpcDiChiChiama } from "../_shared/preventivoVisibile.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
import { getBrandingForCompany } from "../_shared/getBranding.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";
import { dataItalianaLunga } from "../_shared/dataItaliana.ts";
import { congelaDocumento, DocumentoNonPronto } from "../_shared/documentoCongelato.ts";
import { livelloFirmaAzienda } from "../_shared/firmaAvanzata.ts";
import { brandingFirma, emailInvitoFirma, emailPreventivoPdf } from "../_shared/emailFirma.ts";

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
      recipient_phone,
      custom_message,
      expires_days,
      // "solo_pdf": manda il preventivo in PDF via email, senza firma OTP.
      // Additivo: il flusso firma resta identico quando mode e' assente.
      mode,
      // Preventivo cointestato: il secondo firmatario ({ nome, email, telefono }). Firmano
      // tutti e due; il preventivo è accettato all'ultima firma (fea-completa-firma).
      cointestatario,
    } = await req.json();

    if (!quote_id) return errorResponse("quote_id richiesto");

    // Load quote
    const { data: quote, error: qErr } = await supabaseAdmin
      .from("quotes")
      .select("*")
      .eq("id", quote_id)
      .single();
    if (qErr || !quote) return errorResponse("Preventivo non trovato", 404);

    // Accesso all'azienda del preventivo (anche multi-azienda e super admin):
    // prima chi lavora su più aziende prendeva 403, dopo che un modulo aveva già
    // caricato il PDF.
    await requireCompanyAccess(supabaseAdmin, userId, quote.company_id, corsH);
    // E deve poter vedere QUEL preventivo (RLS di quotes col suo token), prima di ogni
    // scrittura. L'azienda da sola lasciava a chiunque ne facesse parte (cliente del
    // portale, bloccato col token ancora valido, staff senza permesso) annullare le
    // firme in corso e cambiare link e scadenza prima che generate-quote-pdf dicesse
    // di no; e per i preventivi dei moduli, col PDF già pronto, il PDF non si chiede
    // proprio: l'invio partiva a qualunque indirizzo.
    const comeChiChiama = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    if (!(await preventivoVisibile(comeChiChiama as unknown as ClienteDiChiChiama, quote.id))) {
      return errorResponse("Preventivo non trovato", 404, corsH);
    }
    // Mandarlo al cliente cambia il preventivo e annulla le firme in corso: serve poterlo
    // MODIFICARE, non solo vederlo (deciso da Florin il 26/09/2026, come per righe e schede
    // tecniche). Risponde la policy di modifica di quotes, coi permessi di chi chiama.
    if (!(await preventivoModificabile(comeChiChiama as unknown as ClienteRpcDiChiChiama, quote.id))) {
      return errorResponse("Per mandare il preventivo al cliente serve il permesso di modificare i preventivi.", 403, corsH);
    }

    // Un'offerta già decisa non si rimanda «per la firma»: in questa modalità il
    // preventivo torna SEMPRE «inviata», le richieste di firma aperte si annullano
    // e il cliente riceve un link nuovo. Con una pagina rimasta aperta («Reinvia»)
    // dopo che il cliente aveva firmato, un'offerta accettata tornava «inviata».
    // Il PDF semplice non cambia lo stato (vedi sotto) e resta possibile.
    if (mode !== "solo_pdf" && ["accettata", "rifiutata", "convertita", "annullata"].includes(String(quote.status))) {
      const dettaglio = quote.status === "accettata" ? "già accettato (firmato)"
        : quote.status === "convertita" ? "già diventato commessa"
        : quote.status === "rifiutata" ? "stato rifiutato dal cliente" : "annullato";
      return errorResponse(
        `Questo preventivo è ${dettaglio}: non si può rimandare per la firma. Per un'altra offerta, duplicalo o fanne una nuova revisione.`,
        409,
        corsH,
      );
    }

    // Determine recipient
    // Lo sconto era controllato solo nel browser (QuoteDiscountControl): qui
    // nessuno guardava approval_status, e un preventivo oltre il limite del
    // ruolo partiva lo stesso. La regola è la stessa RPC che usa l'interfaccia.
    const scontoPct = Number(quote.discount_percent ?? 0);
    if (scontoPct > 0 && quote.approval_status !== "approved") {
      const { data: limiti } = await supabaseAdmin.rpc("compute_max_discount", {
        p_quote_id: quote_id,
        p_user_id: userId,
      });
      const maxPct = Number((limiti as { max_sconto_pct?: number } | null)?.max_sconto_pct ?? 100);
      if (scontoPct > maxPct + 1e-9) {
        return errorResponse(
          `Sconto del ${scontoPct}% oltre il limite consentito (${maxPct}%): serve l'approvazione prima di inviare il preventivo.`,
          403,
        );
      }
    }

    const finalEmail = recipient_email || quote.client_email;
    const finalName = recipient_name || quote.client_name || "Cliente";

    if (!finalEmail) {
      return errorResponse("Il cliente non ha un indirizzo email");
    }
    const coNome = typeof cointestatario?.nome === "string" ? cointestatario.nome.trim() : "";
    const coEmail = typeof cointestatario?.email === "string" ? cointestatario.email.trim() : "";
    const coTelefono = typeof cointestatario?.telefono === "string" ? cointestatario.telefono.trim() : "";
    const conCointestatario = mode !== "solo_pdf" && Boolean(coNome || coEmail);
    if (conCointestatario) {
      if (!coNome || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(coEmail)) {
        return errorResponse("Per la firma del cointestatario servono nome ed email validi.", 400, corsH);
      }
      // Codice, identità e copia firmata viaggiano per email: due firmatari, due indirizzi.
      if (coEmail.toLowerCase() === String(finalEmail).trim().toLowerCase()) {
        return errorResponse("Il cointestatario deve avere un indirizzo email diverso da quello del cliente.", 400, corsH);
      }
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
          timeoutMs: 60_000,
        },
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

      // Testi ripuliti e grafica dell'azienda (_shared/emailFirma.ts).
      const emailPdf = emailPreventivoPdf(await brandingFirma(supabaseAdmin, quote.company_id), {
        nome: finalName, numero: quote.quote_number, oggetto: quote.title ?? null,
        importo: Number(quote.total || 0), messaggio: typeof custom_message === "string" ? custom_message : null,
      });

      const invio = await sendEmailUnified({
        companyId:    quote.company_id,
        stream:       "transactional",
        to:           [finalEmail],
        subject:      emailPdf.subject,
        html:         emailPdf.html,
        text:         emailPdf.text,
        replyTo:      emailPdf.replyTo,
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
    const tokenCointestatario = conCointestatario ? crypto.randomUUID().replace(/-/g, "") : null;
    const gruppoFirma = conCointestatario ? crypto.randomUUID() : null;
    const tipoFirmatario = quote.client_company || quote.client_vat_number ? "b2b" : "b2c";
    const nowIso = new Date().toISOString();

    // Prima di congelare il PDF: una sola richiesta attiva per preventivo (le
    // vecchie si annullano, e finché ce n'è una aperta il PDF non si rigenera),
    // e sul preventivo la scadenza e il link nuovi. Prima il PDF firmato
    // stampava la validità del salvataggio precedente e un QR col link vecchio.
    const { error: cancelErr } = await supabaseAdmin
      .from("signature_requests")
      .update({ status: "cancelled", updated_at: nowIso })
      .eq("company_id", quote.company_id)
      .eq("quote_id", quote_id)
      .in("status", ["pending", "otp_verified"]);
    if (cancelErr) {
      console.error("Cancel previous quote signature requests failed:", cancelErr);
    }
    const { error: preErr } = await supabaseAdmin
      .from("quotes")
      .update({ signature_token: signatureToken, expires_at: expiresAt.toISOString(), updated_at: nowIso })
      .eq("id", quote_id);
    if (preErr) {
      console.error("Scadenza e link del preventivo non aggiornati prima del PDF:", preErr);
    }

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
          timeoutMs: 60_000,
        },
      );
      if (!pdfResp.ok) {
        return errorResponse("Generazione PDF non riuscita: controlla il preventivo e riprova", 500);
      }
      const pdfJson = await pdfResp.json();
      pdfPathFirma = typeof pdfJson?.pdf_path === "string" ? pdfJson.pdf_path : null;
      if (!pdfPathFirma) return errorResponse("PDF del preventivo non disponibile", 500);
    }
    // Copia congelata per la richiesta: il PDF del preventivo può essere
    // rigenerato dopo, quella firmata resta questa.
    const richiestaFirmaId = crypto.randomUUID();
    let congelato: { path: string; hash: string };
    try {
      congelato = await congelaDocumento(supabaseAdmin, {
        tipo: "quote", documentoId: quote_id, companyId: quote.company_id, aziendaNome: "",
        firmatario: finalName, pathPdf: pdfPathFirma,
      }, richiestaFirmaId);
    } catch (e) {
      if (e instanceof DocumentoNonPronto) return errorResponse(e.message, 400);
      throw e;
    }
    const livelloFirma = await livelloFirmaAzienda(supabaseAdmin, quote.company_id);

    const { data: signatureRequest, error: sigReqErr } = await supabaseAdmin
      .from("signature_requests")
      .insert({
        id: richiestaFirmaId,
        company_id: quote.company_id,
        quote_id,
        documento_path: congelato.path,
        livello_firma: livelloFirma,
        token: signatureToken,
        signer_email: finalEmail,
        signer_name: finalName,
        // Cellulare per ricevere il codice anche via SMS: quello scritto nell'invio, altrimenti quello del cliente.
        signer_phone: normalizzaTelefonoE164(recipient_phone || quote.client_phone),
        status: "pending",
        expires_at: expiresAt.toISOString(),
        created_by: userId,
        tipo_documento: "quote",
        tipo_firmatario: tipoFirmatario,
        documento_hash: congelato.hash,
        ...(gruppoFirma ? { gruppo_firma_id: gruppoFirma, ordine_firmatario: 1, firmatari_richiesti: 2 } : {}),
      })
      .select("id, token")
      .single();

    if (sigReqErr || !signatureRequest) {
      console.error("Quote signature request creation failed:", sigReqErr);
      await supabaseAdmin.storage.from("quote-pdfs").remove([congelato.path]);
      return errorResponse("Errore nella creazione della richiesta di firma FEA", 500);
    }
    // Il cointestatario firma lo STESSO documento congelato, con un suo link e un suo codice.
    let richiestaCointestatario: { id: string; token: string } | null = null;
    if (gruppoFirma && tokenCointestatario) {
      const { data: seconda, error: secondaErr } = await supabaseAdmin
        .from("signature_requests")
        .insert({
          company_id: quote.company_id,
          quote_id,
          documento_path: congelato.path,
          livello_firma: livelloFirma,
          token: tokenCointestatario,
          signer_email: coEmail,
          signer_name: coNome,
          signer_phone: normalizzaTelefonoE164(coTelefono || null),
          status: "pending",
          expires_at: expiresAt.toISOString(),
          created_by: userId,
          tipo_documento: "quote",
          tipo_firmatario: "b2c",
          documento_hash: congelato.hash,
          gruppo_firma_id: gruppoFirma,
          ordine_firmatario: 2,
          firmatari_richiesti: 2,
        })
        .select("id, token")
        .single();
      if (secondaErr || !seconda) {
        console.error("Richiesta di firma del cointestatario non creata:", secondaErr);
        await supabaseAdmin.from("signature_requests").update({ status: "cancelled", updated_at: nowIso }).eq("id", signatureRequest.id);
        return errorResponse("Richiesta di firma del cointestatario non creata. Riprova.", 500);
      }
      richiestaCointestatario = seconda;
    }
    await supabaseAdmin.from("fea_audit_log").insert({
      request_id: signatureRequest.id, company_id: quote.company_id, evento: "documento_congelato",
      metadati: { path: congelato.path, documento_hash: congelato.hash, livello_firma: livelloFirma, gruppo_firma_id: gruppoFirma },
    });
    if (richiestaCointestatario) {
      await supabaseAdmin.from("fea_audit_log").insert({
        request_id: richiestaCointestatario.id, company_id: quote.company_id, evento: "documento_congelato",
        metadati: { path: congelato.path, documento_hash: congelato.hash, livello_firma: livelloFirma, gruppo_firma_id: gruppoFirma },
      });
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

    const branding = await getBrandingForCompany(supabaseAdmin, quote.company_id);
    const appUrl = await getPlatformSetting("site_url", "SITE_URL")
      || Deno.env.get("SITE_URL")
      || branding.siteUrl
      || "";
    const signatureLink = `${appUrl}/firma-fea/${signatureToken}`;

    // Un'email sola: l'invito a firmare. Il codice parte quando il cliente lo
    // chiede dalla pagina di firma: mandato adesso, scadeva dopo 10 minuti e
    // il cliente che apriva l'offerta il giorno dopo aveva due email e un
    // codice inutile.
    const invito = emailInvitoFirma(await brandingFirma(supabaseAdmin, quote.company_id), {
      nome: finalName,
      documento: `Preventivo ${quote.quote_number}`,
      oggetto: quote.title ?? null,
      importo: Number(quote.total || 0),
      scadenza: expiresAt,
      link: signatureLink,
      messaggio: typeof custom_message === "string" ? custom_message : null,
    });

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
      subject:      invito.subject,
      html:         invito.html,
      text:         invito.text,
      replyTo:      invito.replyTo,
      templateName: "quote_signature",
      skipCredits:  false,
      adminClient:  supabaseAdmin,
      metadata:     { quote_id: quote.id, quote_number: quote.quote_number },
    });

    if (!result.ok) {
      console.error("Email send failed:", result);
      return errorResponse(`Errore invio email: ${JSON.stringify(result.body)}`, 500);
    }
    await supabaseAdmin.from("fea_audit_log").insert({
      request_id: signatureRequest.id, company_id: quote.company_id, evento: "link_inviato",
      metadati: { signer_email: finalEmail },
    });

    // Il secondo invito, al cointestatario, col suo link.
    let linkCointestatario: string | null = null;
    if (richiestaCointestatario) {
      linkCointestatario = `${appUrl}/firma-fea/${richiestaCointestatario.token}`;
      const invitoCo = emailInvitoFirma(await brandingFirma(supabaseAdmin, quote.company_id), {
        nome: coNome,
        documento: `Preventivo ${quote.quote_number}`,
        oggetto: quote.title ?? null,
        importo: Number(quote.total || 0),
        scadenza: expiresAt,
        link: linkCointestatario,
        messaggio: typeof custom_message === "string" ? custom_message : null,
      });
      await supabaseAdmin.from("fea_audit_log").insert({
        request_id: richiestaCointestatario.id, company_id: quote.company_id, evento: "sessione_creata",
        metadati: { tipo_documento: "quote", signer_email: coEmail, quote_id, gruppo_firma_id: gruppoFirma },
      });
      const esitoCo = await sendEmailUnified({
        companyId: quote.company_id, stream: "transactional", to: [coEmail],
        subject: invitoCo.subject, html: invitoCo.html, text: invitoCo.text, replyTo: invitoCo.replyTo,
        templateName: "quote_signature", skipCredits: false, adminClient: supabaseAdmin,
        metadata: { quote_id: quote.id, quote_number: quote.quote_number, cointestatario: true },
      });
      if (esitoCo.ok) {
        await supabaseAdmin.from("fea_audit_log").insert({
          request_id: richiestaCointestatario.id, company_id: quote.company_id, evento: "link_inviato",
          metadati: { signer_email: coEmail },
        });
      } else {
        console.error("Invito al cointestatario non partito:", esitoCo);
      }
    }

    return jsonResponse({
      success: true,
      message: richiestaCointestatario ? "Offerta inviata ai due intestatari" : "Offerta inviata con successo",
      signature_link: signatureLink,
      signature_request_id: signatureRequest.id,
      // Preventivo cointestato: un link per firmatario.
      firmatari: [
        { nome: finalName, email: finalEmail, link: signatureLink },
        ...(richiestaCointestatario && linkCointestatario ? [{ nome: coNome, email: coEmail, link: linkCointestatario }] : []),
      ],
      // Il codice parte quando il cliente lo chiede: qui l'invito è partito.
      otp_inviato: true,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("send-quote-signature error:", e);
    return errorResponse("Errore interno", 500);
  }
});
// Ripubblicata il 24/10/2026 con la firma del cointestatario.
