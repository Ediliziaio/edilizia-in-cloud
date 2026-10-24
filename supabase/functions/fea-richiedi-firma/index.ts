import { getCorsHeaders } from "../_shared/headers.ts";
import { missingCampoDocument, CAMPO_DOCUMENT_REQUIRED } from "../_shared/campoDocumentGuard.ts";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { getBrandingForCompany } from "../_shared/getBranding.ts";
import { normalizzaTelefonoE164 } from "../_shared/telefonoE164.ts";
import { checkPaymentMethod, PAYMENT_METHOD_REQUIRED_MESSAGE } from "../_shared/requirePaymentMethod.ts";
import { congelaDocumento, DocumentoNonPronto } from "../_shared/documentoCongelato.ts";
import { livelloFirmaAzienda } from "../_shared/firmaAvanzata.ts";
import { brandingFirma, emailInvitoFirma } from "../_shared/emailFirma.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { titoloDelDocumento } from "../_shared/pdfFirmato.ts";

Deno.serve(async (req: Request) => {
  const corsH = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsH });
  }

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);

    const body = await req.json();
    const {
      tipo_documento,
      documento_id,
      tipo_firmatario,
      signer_email,
      signer_name,
      signer_phone,
    } = body;
    // Categoria "umana" del documento (verbale_consegna, collaudo_finale, ...)
    // e note libere: arrivano dall'app campo, si salvano sulla richiesta così
    // ufficio e storico vedono COSA si sta facendo firmare, non un generico
    // "order".
    const categoria = typeof body.categoria === "string" ? body.categoria.slice(0, 64) : null;
    const noteRichiesta = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 2000) : null;
    if (missingCampoDocument(tipo_documento, categoria)) {
      return new Response(JSON.stringify({ error: CAMPO_DOCUMENT_REQUIRED }), {
        status: 422, headers: { ...corsH, "Content-Type": "application/json" },
      });
    }
    const expiresGiorniRaw = Number(body.expires_giorni ?? body.scadenza_giorni ?? 30);
    const expiresGiorni = Number.isFinite(expiresGiorniRaw)
      ? Math.min(Math.max(Math.trunc(expiresGiorniRaw), 1), 365)
      : 30;

    // Validazione campi obbligatori
    if (!tipo_documento || !documento_id || !tipo_firmatario || !signer_email || !signer_name) {
      return new Response(
        JSON.stringify({ error: "Campi obbligatori mancanti: tipo_documento, documento_id, tipo_firmatario, signer_email, signer_name" }),
        { status: 400, headers: { ...corsH, "Content-Type": "application/json" } }
      );
    }

    if (!["order", "quote", "sessione", "odv", "fv", "subappalto"].includes(tipo_documento)) {
      return new Response(
        JSON.stringify({ error: "tipo_documento non valido" }),
        { status: 400, headers: { ...corsH, "Content-Type": "application/json" } }
      );
    }

    // I preventivi si mandano al cliente solo da send-quote-signature (26/09/2026): lì si
    // controlla che chi chiama possa MODIFICARE il preventivo (preventivo_modificabile), lo
    // sconto approvato, e si congela il PDF. Qui bastava far parte dell'azienda (anche un
    // cliente del portale, o un bloccato col token ancora valido) per riscrivere stato, link
    // ed email del cliente e mandare il link di firma a qualunque indirizzo. L'app non la
    // chiama mai con "quote" (0 richieste di questo tipo nel registro FEA).
    if (tipo_documento === "quote") {
      return new Response(
        JSON.stringify({ error: "Per mandare un preventivo usa l'invio del preventivo (send-quote-signature)." }),
        { status: 400, headers: { ...corsH, "Content-Type": "application/json" } }
      );
    }

    if (!["b2b", "b2c"].includes(tipo_firmatario)) {
      return new Response(
        JSON.stringify({ error: "tipo_firmatario non valido: b2b o b2c" }),
        { status: 400, headers: { ...corsH, "Content-Type": "application/json" } }
      );
    }

    // Carica profilo utente
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("company_id, first_name, last_name")
      .eq("id", userId)
      .single();

    if (profileErr || !profile) {
      return new Response(
        JSON.stringify({ error: "Profilo utente non trovato" }),
        { status: 404, headers: { ...corsH, "Content-Type": "application/json" } }
      );
    }

    // L'azienda della richiesta è quella del DOCUMENTO, non del profilo di chi
    // la manda. Prima un utente poteva passare l'id di un documento di un'altra
    // azienda e ottenere il link che lo mostra al cliente; e chi lavora su più
    // aziende firmava a nome della sua azienda principale.
    const tabellaDocumento: Record<string, string> = {
      order: "orders",
      quote: "quotes",
      sessione: "documento_sessioni",
      fv: "fv_progetti",
      // Contratto di subappalto (22/10/2026): il PDF congelato all'invio è in contratti_subappalto.pdf_path.
      subappalto: "contratti_subappalto",
    };
    let company_id: string | null = (profile.company_id as string | null) ?? null;
    const tabella = tabellaDocumento[tipo_documento];
    if (tabella) {
      if (!documento_id) {
        return new Response(
          JSON.stringify({ error: "documento_id richiesto" }),
          { status: 400, headers: { ...corsH, "Content-Type": "application/json" } }
        );
      }
      const { data: documento } = await supabaseAdmin
        .from(tabella)
        .select("company_id")
        .eq("id", documento_id)
        .maybeSingle();
      if (!documento?.company_id) {
        return new Response(
          JSON.stringify({ error: "Documento non trovato" }),
          { status: 404, headers: { ...corsH, "Content-Type": "application/json" } }
        );
      }
      company_id = documento.company_id as string;
    }
    if (!company_id) {
      return new Response(
        JSON.stringify({ error: "Azienda del documento non determinabile" }),
        { status: 400, headers: { ...corsH, "Content-Type": "application/json" } }
      );
    }
    // Azienda principale, accesso multi-azienda o super admin; altrimenti 403.
    await requireCompanyAccess(supabaseAdmin, userId, company_id, corsH);

    // Gate "carta obbligatoria": la firma digitale (FEA + OTP SMS/email) ha un costo.
    const pmCheck = await checkPaymentMethod(supabaseAdmin, company_id);
    if (!pmCheck.allowed) {
      return new Response(
        JSON.stringify({ error: pmCheck.message ?? PAYMENT_METHOD_REQUIRED_MESSAGE, code: "payment_method_required" }),
        { status: 402, headers: { ...corsH, "Content-Type": "application/json" } }
      );
    }

    // Carica nome azienda
    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("name")
      .eq("id", company_id)
      .single();

    const branding = await getBrandingForCompany(supabaseAdmin, company_id);
    const azienda_nome = company?.name ?? branding.platformName;

    // Il documento si congela ADESSO, per ogni tipo: chi firma vede e firma
    // questa copia, e alla firma se ne ricontrolla l'impronta. Senza un
    // documento vero non si manda niente in firma.
    const richiestaId = crypto.randomUUID();
    let congelato: { path: string; hash: string };
    try {
      congelato = await congelaDocumento(supabaseAdmin, {
        tipo: tipo_documento, documentoId: documento_id, companyId: company_id, aziendaNome: azienda_nome,
        categoria, note: noteRichiesta, firmatario: String(signer_name),
      }, richiestaId);
    } catch (e) {
      if (e instanceof DocumentoNonPronto) {
        return new Response(JSON.stringify({ error: e.message }), { status: 400, headers: { ...corsH, "Content-Type": "application/json" } });
      }
      throw e;
    }
    const livelloFirma = await livelloFirmaAzienda(supabaseAdmin, company_id);

    // Token univoco
    const token = crypto.randomUUID().replace(/-/g, "");

    // Preventivo fotovoltaico cointestato: firma anche il secondo intestatario, con un suo
    // link e un suo codice, sullo stesso documento congelato. I dati arrivano dall'invio o,
    // in mancanza, dal progetto. Il preventivo è firmato all'ultima firma (fea-completa-firma).
    let cointestatario: { nome: string; email: string; telefono: string | null } | null = null;
    if (tipo_documento === "fv") {
      const dalBody = body.cointestatario && typeof body.cointestatario === "object" ? body.cointestatario : null;
      let nome = typeof dalBody?.nome === "string" ? dalBody.nome.trim() : "";
      let email = typeof dalBody?.email === "string" ? dalBody.email.trim() : "";
      let tel = typeof dalBody?.telefono === "string" ? dalBody.telefono.trim() : "";
      if (!dalBody) {
        const { data: fvCo } = await supabaseAdmin.from("fv_progetti")
          .select("cointestatario_nome, cointestatario_cognome, cointestatario_email, cointestatario_telefono")
          .eq("id", documento_id).maybeSingle();
        nome = [fvCo?.cointestatario_nome, fvCo?.cointestatario_cognome].map((x) => String(x ?? "").trim()).filter(Boolean).join(" ");
        email = String(fvCo?.cointestatario_email ?? "").trim();
        tel = String(fvCo?.cointestatario_telefono ?? "").trim();
      }
      if (nome || email) {
        if (!nome || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          await supabaseAdmin.storage.from("quote-pdfs").remove([congelato.path]);
          return new Response(JSON.stringify({ error: "Per la firma del cointestatario servono nome ed email validi." }), { status: 400, headers: { ...corsH, "Content-Type": "application/json" } });
        }
        if (email.toLowerCase() === String(signer_email).trim().toLowerCase()) {
          await supabaseAdmin.storage.from("quote-pdfs").remove([congelato.path]);
          return new Response(JSON.stringify({ error: "Il cointestatario deve avere un indirizzo email diverso da quello del cliente." }), { status: 400, headers: { ...corsH, "Content-Type": "application/json" } });
        }
        cointestatario = { nome, email, telefono: tel || null };
      }
    }
    const gruppoFirma = cointestatario ? crypto.randomUUID() : null;

    // Calcola scadenza
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresGiorni);

    // Costruisci insertPayload
    const insertPayload: Record<string, unknown> = {
      id: richiestaId,
      company_id,
      documento_path: congelato.path,
      documento_hash: congelato.hash,
      livello_firma: livelloFirma,
      token,
      signer_email,
      signer_name,
      status: "pending",
      expires_at: expiresAt.toISOString(),
      created_by: userId,
      tipo_documento,
      tipo_firmatario,
      categoria,
      note: noteRichiesta,
      ...(gruppoFirma ? { gruppo_firma_id: gruppoFirma, ordine_firmatario: 1, firmatari_richiesti: 2 } : {}),
    };

    // Cellulare per ricevere il codice anche via SMS. Quello scritto nell'invio;
    // per il fotovoltaico, in mancanza, quello del cliente del progetto.
    let telefono = normalizzaTelefonoE164(signer_phone);
    if (!telefono && tipo_documento === "fv") {
      const { data: fv } = await supabaseAdmin.from("fv_progetti").select("cliente_telefono").eq("id", documento_id).maybeSingle();
      telefono = normalizzaTelefonoE164(fv?.cliente_telefono);
    }
    if (telefono) insertPayload.signer_phone = telefono;

    // Assegna ID documento in base al tipo
    if (tipo_documento === "order") {
      insertPayload.order_id = documento_id;
    } else if (tipo_documento === "quote") {
      insertPayload.quote_id = documento_id;
    } else if (tipo_documento === "sessione") {
      insertPayload.sessione_id = documento_id;
    } else if (tipo_documento === "fv") {
      // Preventivo Fotovoltaico (fv_progetti). Richiede colonna fv_progetto_id
      // su signature_requests (migration 20270618030000_signature_requests_fv_progetto).
      insertPayload.fv_progetto_id = documento_id;
    } else if (tipo_documento === "subappalto") {
      insertPayload.contratto_subappalto_id = documento_id;
    }
    // odv: nessun ID specifico (fallback)

    // Inserisce in signature_requests
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("signature_requests")
      .insert(insertPayload)
      .select("id, token")
      .single();

    if (insertErr || !inserted) {
      console.error("Insert error:", insertErr);
      await supabaseAdmin.storage.from("quote-pdfs").remove([congelato.path]);
      return new Response(
        JSON.stringify({ error: "Errore nella creazione della richiesta di firma" }),
        { status: 500, headers: { ...corsH, "Content-Type": "application/json" } }
      );
    }

    const request_id = inserted.id;
    await supabaseAdmin.from("fea_audit_log").insert({
      request_id, company_id, evento: "documento_congelato",
      metadati: { path: congelato.path, documento_hash: congelato.hash, livello_firma: livelloFirma, gruppo_firma_id: gruppoFirma },
    });

    // La richiesta del cointestatario: stesso documento, suo link.
    let secondaRichiesta: { id: string; token: string } | null = null;
    if (cointestatario && gruppoFirma) {
      const { data: seconda, error: secondaErr } = await supabaseAdmin
        .from("signature_requests")
        .insert({
          ...insertPayload,
          id: crypto.randomUUID(),
          token: crypto.randomUUID().replace(/-/g, ""),
          signer_email: cointestatario.email,
          signer_name: cointestatario.nome,
          signer_phone: normalizzaTelefonoE164(cointestatario.telefono),
          tipo_firmatario: "b2c",
          ordine_firmatario: 2,
        })
        .select("id, token")
        .single();
      if (secondaErr || !seconda) {
        console.error("Richiesta del cointestatario non creata:", secondaErr);
        await supabaseAdmin.from("signature_requests").update({ status: "cancelled" }).eq("id", request_id);
        return new Response(JSON.stringify({ error: "Richiesta di firma del cointestatario non creata. Riprova." }), { status: 500, headers: { ...corsH, "Content-Type": "application/json" } });
      }
      secondaRichiesta = seconda;
      await supabaseAdmin.from("fea_audit_log").insert({
        request_id: seconda.id, company_id, evento: "documento_congelato",
        metadati: { path: congelato.path, documento_hash: congelato.hash, livello_firma: livelloFirma, gruppo_firma_id: gruppoFirma },
      });
    }

    if (tipo_documento === "quote") {
      const { error: quoteUpdateErr } = await supabaseAdmin
        .from("quotes")
        .update({
          status: "inviata",
          signature_token: inserted.token,
          sent_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
          client_email: signer_email,
          client_name: signer_name,
          updated_at: new Date().toISOString(),
        })
        .eq("id", documento_id)
        .eq("company_id", company_id);

      if (quoteUpdateErr) {
        console.error("Quote FEA sync error:", quoteUpdateErr);
      }
    }

    // Un'email sola: l'invito a firmare. Il codice parte quando chi firma lo
    // chiede dalla pagina (prima partiva subito e dopo 10 minuti era scaduto).
    let emailInviata = false;
    try {
      const documento = await titoloDelDocumento(supabaseAdmin, {
        tipo_documento, quote_id: null, fv_progetto_id: tipo_documento === "fv" ? documento_id : null,
        sessione_id: tipo_documento === "sessione" ? documento_id : null,
        contratto_subappalto_id: tipo_documento === "subappalto" ? documento_id : null,
        order_id: tipo_documento === "order" ? documento_id : null, categoria,
      });
      let importo: number | null = null;
      if (tipo_documento === "subappalto") {
        const { data: c } = await supabaseAdmin.from("contratti_subappalto")
          .select("importo_contrattuale, oneri_sicurezza").eq("id", documento_id).maybeSingle();
        importo = c ? (Number(c.importo_contrattuale) || 0) + (Number(c.oneri_sicurezza) || 0) : null;
      }
      const invito = emailInvitoFirma(await brandingFirma(supabaseAdmin, company_id), {
        nome: String(signer_name),
        documento,
        importo,
        scadenza: expiresAt,
        link: `${branding.siteUrl}/firma-fea/${inserted.token}`,
        messaggio: noteRichiesta,
      });
      const invio = await sendEmailUnified({
        companyId: company_id,
        stream: "transactional",
        to: [signer_email],
        subject: invito.subject,
        html: invito.html,
        text: invito.text,
        replyTo: invito.replyTo,
        templateName: "fea_invito_firma",
        skipCredits: true,
        adminClient: supabaseAdmin,
        metadata: { request_id, tipo_documento },
      });
      emailInviata = invio.ok;
      if (emailInviata) {
        await supabaseAdmin.from("fea_audit_log").insert({
          request_id, company_id, evento: "link_inviato", metadati: { signer_email },
        });
      } else {
        console.error("Invito alla firma non inviato:", invio);
      }
      if (secondaRichiesta && cointestatario) {
        const invitoCo = emailInvitoFirma(await brandingFirma(supabaseAdmin, company_id), {
          nome: cointestatario.nome, documento, importo, scadenza: expiresAt,
          link: `${branding.siteUrl}/firma-fea/${secondaRichiesta.token}`, messaggio: noteRichiesta,
        });
        const invioCo = await sendEmailUnified({
          companyId: company_id, stream: "transactional", to: [cointestatario.email],
          subject: invitoCo.subject, html: invitoCo.html, text: invitoCo.text, replyTo: invitoCo.replyTo,
          templateName: "fea_invito_firma", skipCredits: true, adminClient: supabaseAdmin,
          metadata: { request_id: secondaRichiesta.id, tipo_documento, cointestatario: true },
        });
        if (invioCo.ok) {
          await supabaseAdmin.from("fea_audit_log").insert({
            request_id: secondaRichiesta.id, company_id, evento: "link_inviato", metadati: { signer_email: cointestatario.email },
          });
        } else {
          console.error("Invito al cointestatario non inviato:", invioCo);
        }
      }
    } catch (invitoErr) {
      console.error("Invito alla firma non inviato:", invitoErr);
    }

    // Audit log
    await supabaseAdmin.from("fea_audit_log").insert({
      request_id,
      company_id,
      evento: "sessione_creata",
      metadati: { tipo_documento, tipo_firmatario, signer_email, categoria },
    });

    return new Response(
      // otp_inviato resta per le pagine che lo leggono: vuol dire «l'email a chi firma è partita».
      JSON.stringify({
        success: true, request_id, token: inserted.token, email_inviata: emailInviata, otp_inviato: emailInviata,
        // Preventivo cointestato: un link per firmatario.
        firmatari: [
          { nome: String(signer_name), email: signer_email, link: `${branding.siteUrl}/firma-fea/${inserted.token}` },
          ...(secondaRichiesta && cointestatario ? [{ nome: cointestatario.nome, email: cointestatario.email, link: `${branding.siteUrl}/firma-fea/${secondaRichiesta.token}` }] : []),
        ],
      }),
      { status: 200, headers: { ...corsH, "Content-Type": "application/json" } }
    );
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("fea-richiedi-firma error:", err);
    return new Response(
      JSON.stringify({ error: "Errore interno del server" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
// Ripubblicata il 24/10/2026 con la firma del cointestatario.
