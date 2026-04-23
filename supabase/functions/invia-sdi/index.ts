import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyCompanyAccess } from "../_shared/companyAuth.ts";
import { getCorsHeaders } from "../_shared/headers.ts";
import { generateXML } from "../_shared/generateXML.ts";
import { utf8ToBase64 } from "../_shared/base64.ts";

/** Validate Italian P.IVA (11 digits, with Luhn-like check) */
function isValidPartitaIva(piva: string | null | undefined): boolean {
  if (!piva) return false;
  const p = piva.replace(/\s/g, "");
  if (!/^\d{11}$/.test(p)) return false;
  let s = 0;
  for (let i = 0; i < 10; i++) {
    const d = parseInt(p[i]);
    if (i % 2 === 0) {
      s += d;
    } else {
      const x = d * 2;
      s += x > 9 ? x - 9 : x;
    }
  }
  return (10 - (s % 10)) % 10 === parseInt(p[10]);
}

/** Validate Italian Codice Fiscale (16 alphanumeric chars for individuals, or 11-digit P.IVA for entities) */
function isValidCodiceFiscale(cf: string | null | undefined): boolean {
  if (!cf) return false;
  const c = cf.replace(/\s/g, "").toUpperCase();
  // Individual: 16 alphanumeric characters
  if (/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(c)) {
    return true;
  }
  // Entity: same as P.IVA (11 digits)
  return isValidPartitaIva(c);
}

// generateXML, helpers e costanti importate da _shared/generateXML.ts

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Non autorizzato" }), { status: 401, headers: getCorsHeaders(req) });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Non autorizzato" }), { status: 401, headers: getCorsHeaders(req) });
    }
    const userId = user.id;

    const { documento_id } = await req.json();
    if (!documento_id) {
      return new Response(JSON.stringify({ error: "documento_id obbligatorio" }), { status: 400, headers: getCorsHeaders(req) });
    }

    // Load document
    const { data: doc, error: docErr } = await supabase
      .from("documenti_fiscali").select("*").eq("id", documento_id).single();
    if (docErr || !doc) {
      return new Response(JSON.stringify({ error: "Documento non trovato" }), { status: 404, headers: getCorsHeaders(req) });
    }

    // Verify user belongs to this company
    try {
      await verifyCompanyAccess(supabase, userId, doc.company_id);
    } catch {
      return new Response(JSON.stringify({ error: "Non autorizzato: accesso negato a questo documento" }), { status: 403, headers: getCorsHeaders(req) });
    }

    // Verify stato
    if (doc.stato !== "emessa") {
      const statoMsg = doc.stato === "bozza"
        ? "Il documento è in stato 'bozza'. Azione: aprire il documento e cliccare 'Emetti' prima di inviare all'SDI."
        : `Il documento deve essere in stato 'emessa' per inviare a SDI (stato attuale: '${doc.stato}').`;
      return new Response(JSON.stringify({ error: statoMsg }), { status: 422, headers: getCorsHeaders(req) });
    }

    // Load azienda
    const { data: azienda } = await supabase
      .from("anagrafica_azienda").select("*").eq("company_id", doc.company_id).single();
    if (!azienda) {
      return new Response(JSON.stringify({ error: "Anagrafica azienda non configurata" }), { status: 400, headers: getCorsHeaders(req) });
    }

    // Validate mandatory fiscal data before generating XML
    const validationErrors: string[] = [];
    if (!azienda.partita_iva) {
      validationErrors.push("Partita IVA azienda mancante");
    } else if (!isValidPartitaIva(azienda.partita_iva)) {
      validationErrors.push(`Partita IVA azienda non valida: ${azienda.partita_iva}`);
    }
    if (!azienda.ragione_sociale) {
      validationErrors.push("Ragione sociale azienda mancante");
    }
    if (!azienda.regime_fiscale) {
      validationErrors.push("Regime fiscale azienda mancante (es. RF01)");
    }
    if (!azienda.indirizzo_via || !azienda.indirizzo_cap || !azienda.indirizzo_comune) {
      validationErrors.push("Indirizzo azienda incompleto (via, CAP, comune richiesti)");
    }

    const snap = doc.cliente_snapshot || {};
    const isPaCliente = snap.tipo_cliente === "PA";

    // B6: PA CodiceDestinatario must be exactly 6 alphanumeric chars
    if (isPaCliente) {
      const codiceSdi = (snap.codice_sdi || "").trim();
      if (!codiceSdi || codiceSdi.length !== 6) {
        validationErrors.push(
          `Codice Destinatario SDI per PA deve essere esattamente 6 caratteri (attuale: ${codiceSdi || "(vuoto)"})`
        );
      }
    }

    // RF19 forfettario: no IVA, no ritenuta, no split payment
    if (azienda.regime_fiscale === "RF19") {
      const righe: any[] = doc.righe || [];
      const hasIva = righe.some((r: any) => (parseFloat(r.aliquota_iva) || 0) > 0 && !r.natura_iva);
      if (hasIva) {
        validationErrors.push(
          "Regime forfettario RF19: tutte le righe devono avere IVA 0% con natura N2.2 (non soggette)"
        );
      }
      if (doc.ritenuta_acconto) {
        validationErrors.push(
          "Regime forfettario RF19: la ritenuta d'acconto non è applicabile"
        );
      }
    }

    if (!snap.partita_iva && !snap.codice_fiscale) {
      validationErrors.push("Il cliente deve avere Partita IVA o Codice Fiscale");
    }
    if (snap.partita_iva && !isValidPartitaIva(snap.partita_iva) && (snap.indirizzo_nazione || "IT") === "IT") {
      validationErrors.push(`Partita IVA cliente non valida: ${snap.partita_iva}`);
    }
    if (snap.codice_fiscale && !isValidCodiceFiscale(snap.codice_fiscale)) {
      validationErrors.push(`Codice Fiscale cliente non valido: ${snap.codice_fiscale}`);
    }
    if (!snap.ragione_sociale) {
      validationErrors.push("Ragione sociale cliente mancante");
    }

    if (validationErrors.length > 0) {
      return new Response(
        JSON.stringify({ error: "Dati fiscali non validi", details: validationErrors }),
        { status: 422, headers: getCorsHeaders(req) }
      );
    }

    // Generate atomic ProgressivoInvio (unique per company)
    const { data: progressivoData, error: progErr } = await supabase
      .rpc("incrementa_progressivo_sdi", { p_company_id: doc.company_id });
    if (progErr || !progressivoData) {
      return new Response(
        JSON.stringify({ error: "Impossibile generare ProgressivoInvio", details: progErr?.message }),
        { status: 500, headers: getCorsHeaders(req) }
      );
    }
    const progressivoInvio = progressivoData as string;

    // Generate XML
    const xml = generateXML(doc, azienda, progressivoInvio);

    // Save XML to storage
    const xmlPath = `${doc.company_id}/IT${azienda.partita_iva}_${(doc.numero || "").replace(/[^a-zA-Z0-9-]/g, "_")}.xml`;
    const { error: uploadErr } = await supabase.storage
      .from("fatture-xml")
      .upload(xmlPath, new Blob([xml], { type: "application/xml" }), { upsert: true });

    if (uploadErr) {
      console.error("XML upload error:", uploadErr);
    }

    // ── Firma digitale per PA ──
    // Le fatture verso PA (FPA12) devono essere firmate digitalmente (CAdES-BES / p7m)
    const requiresFirma = isPaCliente;
    const xmlToSend = xml;
    let firmatoP7m = false;
    let p7mUrl: string | null = null;

    if (requiresFirma) {
      const firmaProvider = azienda.sdi_firma_provider || "manuale";

      if (firmaProvider === "aruba_sign" && azienda.sdi_firma_api_key) {
        // Firma automatica via Aruba Sign API
        try {
          const firmaResp = await fetch("https://arss.aruba.it/ArubaSignService/ArubaSignService", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${azienda.sdi_firma_api_key}`,
            },
            body: JSON.stringify({
              inputType: "BYNARYNET",
              binaryInput: btoa(xml),
              signatureType: "CADES_BES",
              user: azienda.sdi_firma_username,
            }),
          });

          if (firmaResp.ok) {
            const firmaResult = await firmaResp.json();
            if (firmaResult.signedDocument) {
              // Decode and upload p7m
              const p7mBytes = Uint8Array.from(atob(firmaResult.signedDocument), c => c.charCodeAt(0));
              const p7mPath = xmlPath + ".p7m";
              await supabase.storage
                .from("fatture-xml")
                .upload(p7mPath, p7mBytes, { upsert: true, contentType: "application/pkcs7-mime" });
              p7mUrl = p7mPath;
              firmatoP7m = true;
            }
          } else {
            console.error("Aruba Sign error:", await firmaResp.text());
          }
        } catch (e) {
          console.error("Firma digitale error:", e);
        }
      }

      if (!firmatoP7m && firmaProvider === "manuale") {
        // Modalità manuale: l'XML non firmato è stato salvato in storage.
        // Per le fatture PA la firma è OBBLIGATORIA — blocchiamo l'invio con istruzioni chiare.
        return new Response(
          JSON.stringify({
            error: "Fattura PA richiede firma digitale. Scaricare l'XML, firmarlo con software certificato (es. Aruba Sign, Namirial, DiKe), e ricaricare il file .p7m tramite l'apposita funzione.",
            action: "download_and_sign",
            xml_url: xmlPath,
          }),
          { status: 422, headers: getCorsHeaders(req) }
        );
      }

      // Se Aruba Sign è configurato ma la firma non è riuscita, blocca anche in quel caso
      if (!firmatoP7m) {
        return new Response(
          JSON.stringify({
            error: "Firma digitale per fattura PA non riuscita. Verificare la configurazione Aruba Sign o procedere con firma manuale.",
            action: "check_aruba_sign_config",
          }),
          { status: 422, headers: getCorsHeaders(req) }
        );
      }
    }

    let sdiId: string | null = null;
    let sdiErrors: any[] | null = null;

    // Route to provider
    const provider = azienda.sdi_provider || "manuale";

    if (provider === "aruba" && azienda.sdi_api_key) {
      // Aruba Fatturazione Elettronica API
      // Docs: https://fatturazioneelettronica.aruba.it/apidoc/docs.html
      // Endpoint corretto: /services/invoice/upload (XML in Base64 dentro JSON)
      // Per file già firmati (.p7m): /services/invoice/uploadSigned
      // PRODUZIONE: https://ws.fatturazioneelettronica.aruba.it
      // SANDBOX:    https://fatturazionetest.aruba.it
      const isSandbox = Deno.env.get("ARUBA_SANDBOX") === "true" || azienda.sdi_sandbox === true;
      const arubaBaseUrl = isSandbox
        ? "https://fatturazionetest.aruba.it"
        : "https://ws.fatturazioneelettronica.aruba.it";
      const uploadEndpoint = firmatoP7m
        ? `${arubaBaseUrl}/services/invoice/uploadSigned`
        : `${arubaBaseUrl}/services/invoice/upload`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      try {
        // P2-8: Aruba richiede XML codificato in Base64 dentro JSON.
        // Prima usavamo `btoa(unescape(encodeURIComponent(xml)))`: trucco
        // legacy con `unescape` deprecato (TC39/MDN) e risultati inconsistenti
        // su alcuni code point Unicode (emoji, surrogate). utf8ToBase64 usa
        // TextEncoder, è portabile e corretto su tutto il range Unicode.
        const xmlBase64 = utf8ToBase64(xml);
        const fileName = `IT${azienda.partita_iva}_${progressivoInvio}.xml${firmatoP7m ? ".p7m" : ""}`;

        const resp = await fetch(uploadEndpoint, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${azienda.sdi_api_key}`,
            "Content-Type": "application/json;charset=UTF-8",
          },
          body: JSON.stringify({
            dataFile: xmlBase64,
            credential: null,
            domain: null,
            fileName,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (resp.ok) {
          const result = await resp.json();

          // P1-3: audit raw response per scoprire cambi formato Aruba.
          // Best-effort (il log non deve mai bloccare il flusso dell'invio).
          try {
            await supabase.from("sdi_provider_responses").insert({
              company_id: doc.company_id,
              documento_id: doc.id,
              provider: "aruba",
              endpoint: uploadEndpoint,
              status_code: resp.status,
              response_json: result,
              detected_keys: result && typeof result === "object" ? Object.keys(result) : [],
            });
          } catch (logErr) {
            console.error("[invia-sdi] audit log failed:", logErr);
          }

          // P1-3: fail-hard se nessuna chiave nota. Prima generavamo un
          // crypto.randomUUID() fake dicendo all'utente "fattura inviata":
          // in realtà non c'era modo di tracciarla presso SDI.
          sdiId =
            result?.uploadFileName ||
            result?.idSdi ||
            result?.id ||
            result?.fileIdentifier ||
            null;

          if (!sdiId) {
            console.error(
              "[invia-sdi] Aruba 200 OK ma risposta senza ID SDI tracciabile:",
              JSON.stringify(result),
            );
            sdiErrors = [{
              provider: "aruba",
              status: resp.status,
              message: "Risposta Aruba senza ID tracciabile: segnalare a supporto",
              raw_response: result,
            }];
          }
        } else {
          const errText = await resp.text();
          sdiErrors = [{ provider: "aruba", status: resp.status, message: errText }];
        }
      } catch (fetchErr) {
        clearTimeout(timeout);
        sdiErrors = [{ provider: "aruba", message: String(fetchErr) }];
      }
    } else {
      // Manuale: just save XML, generate a local ID
      sdiId = `MAN-${Date.now()}`;
    }

    if (sdiErrors) {
      // Keep stato as emessa, log error
      await supabase.from("documenti_fiscali")
        .update({ sdi_errori: sdiErrors, sdi_file_xml_url: xmlPath })
        .eq("id", doc.id);

      await supabase.from("sdi_log").insert({
        company_id: doc.company_id,
        documento_id: doc.id,
        evento: "errore_invio",
        messaggio: JSON.stringify(sdiErrors),
        xml_content: xml.slice(0, 5000),
      });

      return new Response(JSON.stringify({ success: false, errors: sdiErrors }), {
        status: 422,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Success: update document
    await supabase.from("documenti_fiscali")
      .update({
        stato: "inviata_sdi",
        sdi_id_trasmissione: sdiId,
        sdi_file_xml_url: xmlPath,
        sdi_firmato: firmatoP7m,
        sdi_file_p7m_url: p7mUrl,
        // AT (attesa) only applies to real SDI submissions; manual mode has no SDI lifecycle
        sdi_stato: provider === "manuale" ? null : "AT",
        trasmissione: provider === "manuale" ? "manuale" : "sdi",
      })
      .eq("id", doc.id);

    // Log
    await supabase.from("sdi_log").insert({
      company_id: doc.company_id,
      documento_id: doc.id,
      evento: "invio",
      sdi_id: sdiId,
      messaggio: `Inviato via ${provider}`,
      xml_content: xml.slice(0, 5000),
    });

    return new Response(JSON.stringify({ success: true, sdi_id: sdiId, xml_url: xmlPath }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("invia-sdi error:", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: getCorsHeaders(req) });
  }
});
