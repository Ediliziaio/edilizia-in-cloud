import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyCompanyAccess } from "../_shared/companyAuth.ts";
import { getCorsHeaders } from "../_shared/headers.ts";
import { generateXML } from "../_shared/generateXML.ts";
import { utf8ToBase64 } from "../_shared/base64.ts";
import { checkPaymentMethod, PAYMENT_METHOD_REQUIRED_MESSAGE } from "../_shared/requirePaymentMethod.ts";
import { valutaPreInvio, claimDocumentoPerInvio, rilasciaClaimInvio } from "../_shared/sdiInvioGuard.ts";

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

  // Claim atomico anti doppio invio (bug #1): se l'invio fallisce DOPO il claim,
  // questi servono a ripristinare lo stato precedente del documento.
  let claimPrevStato: string | null = null;
  let claimedDocId: string | null = null;

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

    const { documento_id, sandbox: sandboxReq } = await req.json();
    if (!documento_id) {
      return new Response(JSON.stringify({ error: "documento_id obbligatorio" }), { status: 400, headers: getCorsHeaders(req) });
    }

    // Modalità sandbox (collaudo SDI di prova): SOLO super_admin. Usa il canale
    // openapi di test (test.invoice.openapi.com) + token dedicato e salta il gate
    // pagamento — l'invio di prova è gratuito e NON deve poter bypassare il gate
    // reale delle aziende. Se un non-super_admin passa sandbox:true viene ignorato
    // e si procede in modalità normale (prod + gate attivo).
    let isSandbox = false;
    if (sandboxReq === true) {
      const { data: saRole } = await supabase
        .from("user_roles").select("role")
        .eq("user_id", userId).eq("role", "super_admin").maybeSingle();
      isSandbox = !!saRole;
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

    // Gate "carta obbligatoria": l'invio della fattura elettronica a SDI ha un costo per documento.
    // In sandbox (collaudo super_admin) l'invio è gratuito → gate saltato.
    if (!isSandbox) {
      const pmCheck = await checkPaymentMethod(supabase, doc.company_id);
      if (!pmCheck.allowed) {
        return new Response(
          JSON.stringify({ error: pmCheck.message ?? PAYMENT_METHOD_REQUIRED_MESSAGE, code: "payment_method_required" }),
          { status: 402, headers: getCorsHeaders(req) },
        );
      }
    }

    // Verify stato — pre-check con messaggi chiari. La VERA guardia anti doppio
    // invio è il claim atomico più sotto. Accetta 'emessa' (primo invio) e
    // 'rifiutata'/'scartata' (reinvio dopo scarto SDI — bug #2), bloccando le
    // fatture già prese in carico/accettate dallo SDI.
    const preInvio = valutaPreInvio(doc);
    if (!preInvio.ok) {
      return new Response(
        JSON.stringify({ error: preInvio.error, code: preInvio.code }),
        { status: preInvio.status, headers: getCorsHeaders(req) },
      );
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

    // Un documento senza righe non e' trasmissibile: la FatturaPA vuole almeno
    // un DettaglioLinee, e lo SDI lo scarterebbe. Senza questo controllo la
    // fattura vuota partiva lo stesso, tornava "rifiutata" e bruciava il numero
    // (in produzione ci sono documenti inviati e rifiutati con zero righe).
    if (!Array.isArray(doc.righe) || doc.righe.length === 0) {
      validationErrors.push(
        "Il documento non ha righe: aggiungi almeno una voce prima di inviarlo allo SDI"
      );
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

    // ── Claim atomico anti doppio invio (bug #1) ──
    // Porta il documento da uno stato inviabile a 'in_invio' in modo ATOMICO
    // (RPC con SELECT ... FOR UPDATE). Solo il claim vincente prosegue alla POST:
    // due chiamate concorrenti (doppio click / retry / due tab) → l'altra riceve
    // claimed=false e abortisce qui SENZA inviare. Va PRIMA del ProgressivoInvio
    // così il "perdente" non consuma un progressivo né genera/trasmette XML.
    const claim = await claimDocumentoPerInvio(supabase, doc.id);
    if (!claim.claimed) {
      const esito = valutaPreInvio({
        stato: claim.currentStato,
        sdi_stato: doc.sdi_stato,
        sdi_id_trasmissione: doc.sdi_id_trasmissione,
      });
      const error = esito.ok ? "Invio già in corso o documento non più inviabile." : esito.error;
      const status = esito.ok ? 409 : esito.status;
      return new Response(
        JSON.stringify({ error, code: "claim_negato" }),
        { status, headers: getCorsHeaders(req) },
      );
    }
    claimPrevStato = claim.previousStato;
    claimedDocId = doc.id;

    // Generate atomic ProgressivoInvio (unique per company)
    const { data: progressivoData, error: progErr } = await supabase
      .rpc("incrementa_progressivo_sdi", { p_company_id: doc.company_id });
    if (progErr || !progressivoData) {
      // Rilascia il claim: nessun invio è avvenuto, il documento deve restare inviabile.
      await rilasciaClaimInvio(supabase, doc.id, claimPrevStato!);
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
        // Rilascia il claim: il documento non è stato trasmesso, deve restare reinviabile.
        await rilasciaClaimInvio(supabase, doc.id, claimPrevStato!);
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
        await rilasciaClaimInvio(supabase, doc.id, claimPrevStato!);
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

    // Guardia: provider Aruba selezionato ma API key mancante. Senza questo blocco
    // il flusso cadeva nel ramo 'manuale' e marcava comunque stato='inviata_sdi' +
    // sdi_stato='AT' → la fattura risultava "trasmessa" senza alcun invio reale, e
    // lo stato 'AT' la rendeva non più reinviabile. Rilascia il claim 'in_invio' e
    // ritorna un errore chiaro SENZA toccare lo stato del documento.
    if (provider === "aruba" && !azienda.sdi_api_key) {
      await rilasciaClaimInvio(supabase, doc.id, claimPrevStato!);
      return new Response(
        JSON.stringify({
          error: "Configura la API key Aruba prima di inviare la fattura allo SDI.",
          action: "check_aruba_api_key",
        }),
        { status: 422, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

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
    } else if (provider === "openapi") {
      // openapi.it Fatturazione Elettronica / SDI.
      // Contratto (verificato in sandbox): POST {base}/IT-invoices con il body =
      // XML FatturaPA GREZZO (Content-Type application/xml). openapi valida lo
      // schema, firma e trasmette allo SDI. Token + ambiente da platform_settings
      // (riusa l'integrazione openapi_it_token / openapi_env già presente).
      const tokKey = isSandbox ? "openapi_it_token_sandbox" : "openapi_it_token";
      const { data: tokRow } = await supabase.from("platform_settings").select("value").eq("key", tokKey).maybeSingle();
      const { data: envRow } = await supabase.from("platform_settings").select("value").eq("key", "openapi_env").maybeSingle();
      const token = (tokRow?.value || Deno.env.get(isSandbox ? "OPENAPI_IT_TOKEN_SANDBOX" : "OPENAPI_IT_TOKEN") || "").trim();
      const env = (envRow?.value || "prod").toLowerCase();
      const invBase = (isSandbox || env === "sandbox" || env === "test") ? "test.invoice.openapi.com" : "invoice.openapi.com";
      const invEndpoint = `https://${invBase}/IT-invoices`;
      if (!token) {
        sdiErrors = [{ provider: "openapi", message: isSandbox
          ? "openapi_it_token_sandbox non configurato. Imposta il token openapi.it SANDBOX (scope Fatturazione/Invoice) in platform_settings."
          : "openapi_it_token non configurato. Imposta il token openapi.it (scope SDI Electronic Invoicing)." }];
      } else {
        // Invia l'XML grezzo: openapi valida, firma (CAdES p7m) e trasmette allo SDI.
        const sendOnce = async () => {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 30000);
          try {
            const r = await fetch(invEndpoint, {
              method: "POST",
              headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/xml" },
              body: xml,
              signal: controller.signal,
            });
            const j = await r.json().catch(() => null);
            return { status: r.status, ok: r.ok, json: j as any };
          } finally {
            clearTimeout(timeout);
          }
        };
        try {
          let res = await sendOnce();
          // Cedente non registrato → auto-registra la P.IVA e ritenta una volta.
          // Rileva sia via HTTP status 424 (vero status della risposta), sia via body.
          const notRegistered = res.status === 424 || res.json?.error === 424
            || /not\s*registered|fiscal id not found/i.test(String(res.json?.message || ""));
          if (notRegistered) {
            const regEmail = azienda.pec || azienda.email || "";
            const regPiva = String(azienda.partita_iva || "").replace(/\D/g, "");
            if (regPiva.length === 11 && azienda.ragione_sociale && regEmail) {
              // Registrazione idempotente (openapi: error 111 / "already exists" = ok).
              // Ritenta SOLO se la registrazione è andata a buon fine.
              try {
                const regRes = await fetch(`https://${invBase}/IT-configurations`, {
                  method: "POST",
                  headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
                  body: JSON.stringify({ fiscal_id: regPiva, name: azienda.ragione_sociale, email: regEmail }),
                });
                const regJson = await regRes.json().catch(() => null) as any;
                const regOk = regRes.ok || regJson?.error === 111 || /already exists/i.test(String(regJson?.message || ""));
                if (regOk) {
                  res = await sendOnce();
                } else {
                  sdiErrors = [{ provider: "openapi", status: regRes.status, message: `Registrazione cedente fallita: ${regJson?.message || `HTTP ${regRes.status}`}`, raw_response: regJson }];
                }
              } catch (regErr) {
                sdiErrors = [{ provider: "openapi", message: `Registrazione cedente non riuscita: ${String(regErr)}` }];
              }
            } else {
              sdiErrors = [{ provider: "openapi", message: "Cedente non registrato sullo SDI e dati incompleti per la registrazione automatica (servono P.IVA 11 cifre, ragione sociale e PEC/email)." }];
            }
          }
          try {
            await supabase.from("sdi_provider_responses").insert({
              company_id: doc.company_id,
              documento_id: doc.id,
              provider: "openapi",
              endpoint: invEndpoint,
              status_code: res.status,
              response_json: res.json,
              detected_keys: res.json && typeof res.json === "object" ? Object.keys(res.json) : [],
            });
          } catch (logErr) {
            console.error("[invia-sdi] audit log openapi failed:", logErr);
          }
          // Non sovrascrivere un errore di registrazione già rilevato sopra.
          if (!sdiErrors) {
            // Richiede un segnale positivo: 2xx + body presente non-success:false.
            if (res.ok && res.json && res.json.success !== false) {
              const d = res.json?.data;
              sdiId =
                (d && (d.id || d.uuid || d.invoice_hash || d.filename || d.idSdi)) ||
                (Array.isArray(d) ? (d[0]?.id || d[0]?.uuid) : null) ||
                (typeof d === "string" ? d : null) ||
                null;
              if (!sdiId) {
                sdiErrors = [{ provider: "openapi", status: res.status, message: "Risposta openapi senza ID tracciabile", raw_response: res.json }];
              }
            } else {
              sdiErrors = [{ provider: "openapi", status: res.status, message: res.json?.message || `Errore openapi (HTTP ${res.status})`, raw_response: res.json }];
            }
          }
        } catch (fetchErr) {
          sdiErrors = [{ provider: "openapi", message: String(fetchErr) }];
        }
      }
    } else {
      // Manuale: just save XML, generate a local ID
      sdiId = `MAN-${Date.now()}`;
    }

    if (sdiErrors) {
      // Invio fallito: registra l'errore e RIPRISTINA lo stato precedente
      // (rilascia il claim 'in_invio' → torna a 'emessa'/'rifiutata') così il
      // documento resta reinviabile (bug #1/#2). Aggiorniamo prima sdi_errori
      // senza toccare `stato`, poi lo ripristiniamo in modo guardato.
      await supabase.from("documenti_fiscali")
        .update({ sdi_errori: sdiErrors, sdi_file_xml_url: xmlPath })
        .eq("id", doc.id);
      await rilasciaClaimInvio(supabase, doc.id, claimPrevStato!);

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
    // Se avevamo già ottenuto il claim, ripristina lo stato per non lasciare il
    // documento bloccato in 'in_invio' (best-effort).
    if (claimPrevStato !== null && claimedDocId) {
      try {
        await rilasciaClaimInvio(supabase, claimedDocId, claimPrevStato);
      } catch { /* non mascherare l'errore originale */ }
    }
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: getCorsHeaders(req) });
  }
});
