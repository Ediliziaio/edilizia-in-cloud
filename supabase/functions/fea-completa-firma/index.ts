// Tocco del 27/10/2026: il documento congelato del fotovoltaico non accetta piu' la versione senza condizioni
// contrattuali (_shared/documentoCongelato.ts). Il job di deploy guarda solo i file cambiati sotto la cartella
// della funzione: senza questa riga la funzione resterebbe quella di prima.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { missingCampoDocument, CAMPO_DOCUMENT_REQUIRED } from "../_shared/campoDocumentGuard.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { clausoleDellaFirma, informativaPrivacyDellaFirma } from "../_shared/clausoleFirma.ts";
import { assicuraPdfFirmato, titoloDelDocumento } from "../_shared/pdfFirmato.ts";
import { getBrandingForCompany } from "../_shared/getBranding.ts";
import { brandingFirma, emailCopiaFirmata, emailFirmaAvvenutaAzienda } from "../_shared/emailFirma.ts";
import { erroreStatoFirma, variantiTokenFirma } from "../_shared/statoFirma.ts";
import { controllaSessioneFirma, firmatarioIdentificato, ipDellaRichiesta } from "../_shared/firmaAvanzata.ts";
import { rileggiDocumentoCongelato } from "../_shared/documentoCongelato.ts";
import { conservaProveFirma } from "../_shared/proveFirma.ts";

// Risolve l'utente "proprietario" del documento a cui inviare la notifica:
//  - quote → quotes.assigned_to || quotes.created_by
//  - order/odv/fv → orders.assigned_to || orders.created_by
//  - fallback → signature_requests.created_by
// deno-lint-ignore no-explicit-any
async function risolviOwner(admin: any, sigReq: {
  created_by?: string | null;
  tipo_documento?: string | null;
  quote_id?: string | null;
  order_id?: string | null;
}): Promise<string | null> {
  try {
    if (sigReq.tipo_documento === "quote" && sigReq.quote_id) {
      const { data } = await admin
        .from("quotes")
        .select("created_by, assigned_to")
        .eq("id", sigReq.quote_id)
        .single();
      const owner = data?.assigned_to || data?.created_by;
      if (owner) return owner;
    } else if (
      (sigReq.tipo_documento === "order" || sigReq.tipo_documento === "odv" || sigReq.tipo_documento === "fv") &&
      sigReq.order_id
    ) {
      const { data } = await admin
        .from("orders")
        .select("created_by, assigned_to")
        .eq("id", sigReq.order_id)
        .single();
      const owner = data?.assigned_to || data?.created_by;
      if (owner) return owner;
    }
  } catch (e) {
    console.warn("risolviOwner lookup error:", e);
  }
  return sigReq.created_by ?? null;
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
      sessione_firma,
      lat,
      lng,
      b2c_recesso_accettato,
      b2c_clausole_approvate,
      clausole_approvate,
      privacy_accettata,
    } = body;

    const varianti = variantiTokenFirma(token);
    if (!varianti.length) {
      return errore(400, "token obbligatorio");
    }

    // Solo il PRIMO IP: x-forwarded-for è spesso una lista "client, proxy…" e
    // firma_ip è INET — con la lista il cast fallisce e l'UPDATE della firma
    // andrebbe in errore: il cliente non riuscirebbe a firmare.
    const ip = ipDellaRichiesta(req);
    // Il dispositivo lo dice la richiesta, non un campo scritto dal browser.
    const user_agent = req.headers.get("user-agent")?.slice(0, 500) ?? null;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Carica sigReq via token
    const { data: sigReq, error: fetchErr } = await supabaseAdmin
      .from("signature_requests")
      .select("id, status, expires_at, tipo_firmatario, signer_email, signer_name, documento_hash, company_id, sessione_id, order_id, quote_id, fv_progetto_id, contratto_subappalto_id, tipo_documento, created_by, categoria, documento_path, livello_firma, sessione_firma_hash, sessione_firma_scadenza, gruppo_firma_id")
      .in("token", varianti).order("created_at", { ascending: false }).limit(1)
      .maybeSingle();

    if (fetchErr || !sigReq) {
      return errore(404, "Richiesta di firma non trovata");
    }
    const statoNonValido = erroreStatoFirma(sigReq);
    if (statoNonValido) return errore(statoNonValido.status, statoNonValido.error);

    // Check: status deve essere otp_verified
    if (missingCampoDocument(sigReq.tipo_documento, sigReq.categoria)) {
      return errore(422, CAMPO_DOCUMENT_REQUIRED);
    }
    if (sigReq.status !== "otp_verified") {
      if (sigReq.status === "signed") {
        return errore(409, "Documento già firmato");
      }
      return errore(409, `Stato non valido per la firma: ${sigReq.status}. Verifica prima il codice OTP.`);
    }

    // Solo il browser che ha inserito il codice giusto, entro 15 minuti.
    if (!(await controllaSessioneFirma(sigReq, sessione_firma))) {
      return new Response(JSON.stringify({ error: "Il tempo per firmare è scaduto: richiedi un nuovo codice.", code: "sessione_scaduta" }), {
        status: 401, headers: { ...corsH, "Content-Type": "application/json" },
      });
    }

    // Firma avanzata: chi firma deve essersi identificato con un documento valido.
    const firmatario = sigReq.livello_firma === "avanzata"
      ? await firmatarioIdentificato(supabaseAdmin, sigReq.company_id, sigReq.signer_email)
      : null;
    if (sigReq.livello_firma === "avanzata" && !firmatario?.dichiarazione_accettata_at) {
      return new Response(JSON.stringify({
        error: firmatario ? "Prima di firmare accetta le condizioni del servizio di firma." : "Prima di firmare carica il tuo documento d'identità.",
        code: "identificazione_richiesta",
      }), {
        status: 409, headers: { ...corsH, "Content-Type": "application/json" },
      });
    }

    // Il documento firmato è la copia congelata all'invio: se non è più quella, non si firma.
    let hashAllaFirma: string | null = null;
    if (sigReq.documento_path) {
      let controllo: { hash: string; integro: boolean };
      try {
        controllo = await rileggiDocumentoCongelato(supabaseAdmin, sigReq.documento_path, sigReq.documento_hash);
      } catch {
        return errore(503, "Il documento non si apre in questo momento. Riprova tra qualche istante.");
      }
      if (!controllo.integro) {
        return errore(409, "Il documento risulta cambiato dopo l'invio e non si può firmare. Chiedi all'azienda di inviarlo di nuovo.");
      }
      hashAllaFirma = controllo.hash;
    }

    // Check B2C: recesso obbligatorio
    if (sigReq.tipo_firmatario === "b2c" && b2c_recesso_accettato !== true) {
      return errore(400, "Il diritto di recesso deve essere accettato per procedere");
    }

    // Seconda firma (art. 1341 c.c.): ogni clausola da approvare a parte deve
    // esserlo, per privati e aziende. Prima nessuno lo controllava.
    const attese = await clausoleDellaFirma(supabaseAdmin, sigReq);
    const arrivate: unknown = Array.isArray(clausole_approvate) ? clausole_approvate : b2c_clausole_approvate;
    const approvate = Array.isArray(arrivate) ? arrivate.filter((x): x is string => typeof x === "string") : [];
    if (attese.some((c) => !approvate.includes(c.id))) {
      return errore(400, "Per firmare approva ogni clausola specifica del contratto.");
    }

    // Informativa privacy: chi firma un contratto la accetta con una spunta.
    const informativaPrivacy = await informativaPrivacyDellaFirma(supabaseAdmin, sigReq);
    if (informativaPrivacy && privacy_accettata !== true) {
      return errore(400, "Per firmare conferma di aver letto l'informativa privacy.");
    }

    const ora = new Date().toISOString();

    // Costruisci updatePayload
    const updatePayload: Record<string, unknown> = {
      status: "signed",
      signed_at: ora,
      firma_ip: ip,
      firma_user_agent: user_agent,
      firma_lat: lat ?? null,
      firma_lng: lng ?? null,
      // La chiave di sessione vale per una sola firma.
      sessione_firma_hash: null,
      sessione_firma_scadenza: null,
    };
    if (hashAllaFirma) updatePayload.documento_hash_firma = hashAllaFirma;
    if (firmatario) updatePayload.firmatario_id = firmatario.id;

    if (attese.length) {
      updatePayload.clausole_approvate = attese.map((c) => c.id);
      updatePayload.clausole_approvate_ts = ora;
    }

    // Per B2C
    if (sigReq.tipo_firmatario === "b2c") {
      updatePayload.b2c_recesso = b2c_recesso_accettato ?? true;
      updatePayload.b2c_recesso_ts = ora;
      updatePayload.b2c_clausole = b2c_clausole_approvate ?? null;
    }

    // Aggiorna signature_requests
    const { data: firmata, error: firmaErr } = await supabaseAdmin
      .from("signature_requests")
      .update(updatePayload)
      .eq("id", sigReq.id).eq("status", "otp_verified")
      .eq("sessione_firma_hash", sigReq.sessione_firma_hash)
      .eq("expires_at", sigReq.expires_at).gt("expires_at", ora)
      .select("id").maybeSingle();
    if (firmaErr) return errore(500, "Firma non registrata. Riprova tra qualche istante.");
    if (!firmata) return errore(409, "La richiesta di firma è cambiata. Ricarica il documento prima di procedere.");

    // Preventivo cointestato: firmano tutti e due. Il documento si chiude (preventivo
    // accettato, progetto firmato) solo all'ultima firma del gruppo, e una volta sola anche
    // se le due firme arrivano insieme (fea_gruppo_dopo_firma). Una richiesta da sola si
    // chiude con la sua firma, come prima.
    const { data: statoGruppo, error: gruppoErr } = await supabaseAdmin.rpc("fea_gruppo_dopo_firma", { p_richiesta: sigReq.id });
    if (gruppoErr) console.error("Stato del gruppo di firma non letto:", gruppoErr);
    const gruppo = (Array.isArray(statoGruppo) ? statoGruppo[0] : statoGruppo) as
      { completo: boolean; chiude: boolean; firmati: number; richiesti: number; nomi: string | null } | null;
    // Una richiesta da sola si chiude con la sua firma anche se la risposta sul gruppo manca;
    // in un gruppo, senza risposta il documento resta aperto: meglio una firma da completare
    // che un'accettazione a metà.
    const chiudeDocumento = gruppo ? gruppo.chiude : !sigReq.gruppo_firma_id;
    const nomiFirmatari = gruppo?.nomi || sigReq.signer_name;
    const ripristinaGruppo = async () => {
      if (!sigReq.gruppo_firma_id) return;
      await supabaseAdmin.from("signature_requests").update({ gruppo_completato_at: null }).eq("gruppo_firma_id", sigReq.gruppo_firma_id);
    };

    if (chiudeDocumento && sigReq.quote_id) {
      const { data: preventivoAggiornato, error: quoteUpdateErr } = await supabaseAdmin
        .from("quotes")
        .update({
          status: "accettata",
          signed_at: ora,
          signed_by_name: nomiFirmatari,
          updated_at: ora,
        })
        .eq("id", sigReq.quote_id)
        .eq("company_id", sigReq.company_id).select("id").maybeSingle();

      if (quoteUpdateErr || !preventivoAggiornato) {
        console.error("Quote FEA signed sync error:", quoteUpdateErr);
        // Rollback: la firma non può risultare completata se il preventivo
        // collegato non è stato aggiornato. Ripristina lo stato precedente.
        await supabaseAdmin
          .from("signature_requests")
          .update({ status: sigReq.status, signed_at: null, firma_ip: null, firma_user_agent: null,
            firma_lat: null, firma_lng: null, b2c_recesso: null, b2c_recesso_ts: null,
            b2c_clausole: null, clausole_approvate: null, clausole_approvate_ts: null,
            documento_hash_firma: null, firmatario_id: null,
            sessione_firma_hash: sigReq.sessione_firma_hash, sessione_firma_scadenza: sigReq.sessione_firma_scadenza })
          .eq("id", sigReq.id).eq("status", "signed").eq("signed_at", ora);
        await ripristinaGruppo();
        return errore(500, "Errore nell'aggiornamento del preventivo collegato. La firma non è stata registrata: riprova tra qualche istante.");
      }
    }

    // Anche il progetto da cui nasce il documento risulta firmato. Prima restava
    // «emesso» (fotovoltaico) o «bozza» (moduli): modificabile, annullabile, e
    // l'opportunità non vedeva mai un preventivo accettato.
    if (chiudeDocumento && sigReq.fv_progetto_id) {
      const { error: fvErr } = await supabaseAdmin
        .from("fv_progetti")
        .update({ stato: "firmato", firmato_il: ora })
        .eq("id", sigReq.fv_progetto_id)
        .eq("company_id", sigReq.company_id);
      if (fvErr) console.error("Stato firmato sul preventivo fotovoltaico non aggiornato:", fvErr);
    }
    if (chiudeDocumento && sigReq.quote_id) {
      // I moduli (ristrutturazione, bagni…) firmano tramite un preventivo «ombra»
      // con source = modulo:<chiave>:<id progetto>.
      const { data: ombra } = await supabaseAdmin
        .from("quotes")
        .select("source")
        .eq("id", sigReq.quote_id)
        .maybeSingle();
      const modulo = /^modulo:([a-z]+):([0-9a-f-]{36})$/.exec(String(ombra?.source ?? ""));
      const tabellaModulo: Record<string, string> = {
        rst: "rst_progetti", bagni: "bgn_progetti", tetti: "tet_progetti", clm: "clm_progetti",
        ele: "ele_progetti", idr: "idr_progetti", pav: "pav_progetti", pis: "pis_progetti",
        sr: "sr_progetti",
      };
      const tabella = modulo ? tabellaModulo[modulo[1]] : undefined;
      if (modulo && tabella) {
        // Serramenti ha anche la data di firma (la pagina /stima mostra «Firmata il»).
        const { error: modErr } = await supabaseAdmin
          .from(tabella)
          .update(modulo[1] === "sr" ? { stato: "accettato", firmato_il: ora } : { stato: "accettato" })
          .eq("id", modulo[2])
          .eq("company_id", sigReq.company_id);
        if (modErr) console.error(`Stato accettato su ${tabella} non aggiornato:`, modErr);
      }
    }

    // Audit log firma_completata
    await supabaseAdmin.from("fea_audit_log").insert({
      request_id: sigReq.id,
      company_id: sigReq.company_id,
      evento: "firma_completata",
      ip,
      user_agent,
      lat: lat ?? null,
      lng: lng ?? null,
      metadati: {
        tipo_firmatario: sigReq.tipo_firmatario,
        documento_hash: sigReq.documento_hash,
        documento_hash_firma: hashAllaFirma,
        livello_firma: sigReq.livello_firma,
        firmatario_id: firmatario?.id ?? null,
        gruppo_firma_id: sigReq.gruppo_firma_id ?? null,
        firmati_nel_gruppo: gruppo ? `${gruppo.firmati}/${gruppo.richiesti}` : null,
        b2c_recesso: sigReq.tipo_firmatario === "b2c" ? (b2c_recesso_accettato ?? true) : null,
        // Il consenso con il testo che chi firma ha visto: è la prova.
        privacy_accettata: informativaPrivacy ? true : null,
        informativa_privacy: informativaPrivacy,
      },
    });

    // Il PDF firmato (timbro su ogni pagina + certificato) e la copia via email.
    // Dopo la risposta: la firma è già registrata e non deve aspettare né
    // fallire per colpa del PDF. Se la generazione non riesce, il PDF si rifà
    // dall'app (fea-pdf-firmato) e la copia resta senza allegato.
    const copiaFirmata = (async () => {
      let allegato: { filename: string; content: string; type: string } | undefined;
      let codice: string | null = null;
      try {
        const esito = await assicuraPdfFirmato(supabaseAdmin, sigReq.id);
        codice = esito.codiceVerifica;
        const { data: file } = await supabaseAdmin.storage.from("quote-pdfs").download(esito.path);
        if (file && file.size <= 8 * 1024 * 1024) {
          const bytes = new Uint8Array(await file.arrayBuffer());
          let bin = "";
          for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          allegato = { filename: `documento-firmato-${esito.codiceVerifica}.pdf`, content: btoa(bin), type: "application/pdf" };
        }
      } catch (pdfErr) {
        console.error("PDF firmato non generato:", pdfErr instanceof Error ? pdfErr.message : pdfErr);
      }
      // Le prove della firma, da conservare 20 anni (si riprova da fea-pdf-firmato).
      try {
        await conservaProveFirma(supabaseAdmin, sigReq.id);
      } catch (proveErr) {
        console.error("Prove della firma non conservate:", proveErr instanceof Error ? proveErr.message : proveErr);
      }

      // Le email con il marchio dell'azienda (_shared/emailFirma.ts).
      const marchio = await brandingFirma(supabaseAdmin, sigReq.company_id);
      const sito = (await getBrandingForCompany(supabaseAdmin, sigReq.company_id)).siteUrl;
      const documento = await titoloDelDocumento(supabaseAdmin, sigReq);
      const linkVerifica = codice ? `${sito}/verifica-firma?codice=${encodeURIComponent(codice)}` : null;

      // Avviso all'azienda, oltre alla notifica nell'app: all'email dell'azienda, se c'è.
      if (marchio.email) {
        try {
          const avviso = emailFirmaAvvenutaAzienda(marchio, {
            firmatario: sigReq.signer_name ?? "Il cliente", documento, firmatoIl: ora,
            codiceVerifica: codice, linkApp: `${sito}/azienda/firma-elettronica`,
          });
          await sendEmailUnified({
            companyId: sigReq.company_id, stream: "transactional", to: [marchio.email],
            subject: avviso.subject, html: avviso.html, text: avviso.text,
            templateName: "fea_firma_avvenuta_azienda", skipCredits: true, adminClient: supabaseAdmin,
            metadata: { request_id: sigReq.id },
          });
        } catch (e) {
          console.error("Avviso firma all'azienda non inviato:", e);
        }
      }

      // Copia al firmatario: ai privati come prima; alle aziende solo se c'è il PDF.
      if (sigReq.tipo_firmatario !== "b2c" && !allegato) return;
      try {
        const copia = emailCopiaFirmata(marchio, {
          nome: sigReq.signer_name ?? "Gentile cliente", documento, firmatoIl: ora,
          codiceVerifica: codice, linkVerifica, conPdf: !!allegato,
        });
        const invio = await sendEmailUnified({
          companyId:    sigReq.company_id,
          stream:       "transactional",
          to:           [sigReq.signer_email],
          subject:      copia.subject,
          html:         copia.html,
          text:         copia.text,
          replyTo:      copia.replyTo,
          templateName: "fea_firma_completata",
          skipCredits:  true,
          adminClient:  supabaseAdmin,
          attachments:  allegato ? [allegato] : undefined,
          metadata:     { request_id: sigReq.id, signer_email: sigReq.signer_email },
        });
        if (!invio.ok) throw new Error("Invio copia firmata non riuscito");

        await supabaseAdmin
          .from("signature_requests")
          .update({ b2c_email_copia: true })
          .eq("id", sigReq.id);

        await supabaseAdmin.from("fea_audit_log").insert({
          request_id: sigReq.id,
          company_id: sigReq.company_id,
          evento: "email_copia_inviata",
          metadati: { signer_email: sigReq.signer_email, con_pdf: !!allegato },
        });
      } catch (emailErr) {
        console.error("Email copia firmata error:", emailErr);
        // Non blocchiamo la firma per un errore email
      }

      // Preventivo cointestato completo: anche chi aveva già firmato riceve il documento
      // finale, con le firme di tutti.
      if (gruppo?.completo && gruppo.richiesti > 1 && sigReq.gruppo_firma_id && allegato) {
        const { data: altri } = await supabaseAdmin.from("signature_requests")
          .select("id, signer_name, signer_email")
          .eq("gruppo_firma_id", sigReq.gruppo_firma_id).neq("id", sigReq.id).eq("status", "signed");
        for (const a of altri ?? []) {
          try {
            const copiaFinale = emailCopiaFirmata(marchio, {
              nome: a.signer_name ?? "Gentile cliente", documento, firmatoIl: ora,
              codiceVerifica: codice, linkVerifica, conPdf: true,
            });
            await sendEmailUnified({
              companyId: sigReq.company_id, stream: "transactional", to: [a.signer_email],
              subject: copiaFinale.subject, html: copiaFinale.html, text: copiaFinale.text, replyTo: copiaFinale.replyTo,
              templateName: "fea_firma_completata", skipCredits: true, adminClient: supabaseAdmin,
              attachments: [allegato], metadata: { request_id: a.id, signer_email: a.signer_email, documento_finale: true },
            });
          } catch (e) {
            console.error("Copia finale al primo firmatario non inviata:", e);
          }
        }
      }
    })();
    // deno-lint-ignore no-explicit-any
    const runtime = (globalThis as any).EdgeRuntime;
    if (runtime?.waitUntil) runtime.waitUntil(copiaFirmata);
    else await copiaFirmata;

    // Notifica interna al titolare del documento: la firma è avvenuta.
    // La pagina pubblica dice al cliente che "l'azienda è stata informata":
    // questa notifica lo rende vero. Non bloccante: un errore qui non deve
    // invalidare la firma già registrata.
    try {
      const ownerId = await risolviOwner(supabaseAdmin, sigReq);
      if (ownerId) {
        const signerLabel = sigReq.signer_name ?? "il cliente";
        const parziale = gruppo && gruppo.richiesti > 1 && !gruppo.completo;
        const titoloAvviso = parziale
          ? `Firmato da ${signerLabel}: ${gruppo.firmati} firme su ${gruppo.richiesti}`
          : `Documento firmato da ${nomiFirmatari ?? signerLabel}`;
        const testoAvviso = parziale
          ? `${signerLabel} ha firmato. Manca la firma del cointestatario: il preventivo sarà accettato quando firmano tutti.`
          : `${nomiFirmatari ?? signerLabel} ha firmato elettronicamente il documento.`;
        await supabaseAdmin.rpc("create_notification", {
          p_company_id: sigReq.company_id,
          p_user_id: ownerId,
          p_type: "documento_firmato",
          p_title: titoloAvviso,
          p_body: testoAvviso,
          p_entity_type: "signature_request",
          p_entity_id: sigReq.id,
          p_action_url: "/azienda/firma-elettronica",
        });
      }
    } catch (notifyErr) {
      console.warn("fea-completa-firma notify owner error:", notifyErr);
    }

    return new Response(
      JSON.stringify({
        success: true, firma_timestamp: ora,
        // Preventivo cointestato: quanti hanno firmato su quanti devono firmare.
        firmati: gruppo?.firmati ?? 1, firmatari_richiesti: gruppo?.richiesti ?? 1, completo: gruppo?.completo ?? true,
      }),
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
