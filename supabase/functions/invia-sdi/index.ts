import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyCompanyAccess } from "../_shared/companyAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function escXml(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtNum(n: number, d = 2): string { return n.toFixed(d); }
function fmtDate(d: string | null | undefined): string { return d ? d.slice(0, 10) : ""; }

const TIPO_TO_TD: Record<string, string> = {
  fattura: "TD01", fattura_pa: "TD01", nota_credito: "TD04", nota_debito: "TD05",
  autofattura: "TD20", fattura_riepilogativa: "TD24", ddt: "TD24",
};

function generateXML(doc: Record<string, any>, azienda: Record<string, any>): string {
  const snap = doc.cliente_snapshot || {};
  const isPa = snap.tipo_cliente === "PA";
  const formato = isPa ? "FPA12" : "FPR12";
  const codDest = snap.codice_sdi || (isPa ? "" : "0000000");
  const tipoDoc = TIPO_TO_TD[doc.tipo] || "TD01";
  const righe: any[] = doc.righe || [];
  const riepilogo: any[] = doc.riepilogo_iva || [];
  const scadenze: any[] = doc.scadenze_pagamento || [];
  const progressivo = (doc.numero || "00001").replace(/[^a-zA-Z0-9]/g, "").slice(0, 10);

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="${formato}" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <FatturaElettronicaHeader>
    <DatiTrasmissione>
      <IdTrasmittente><IdPaese>IT</IdPaese><IdCodice>${escXml(azienda.partita_iva)}</IdCodice></IdTrasmittente>
      <ProgressivoInvio>${escXml(progressivo)}</ProgressivoInvio>
      <FormatoTrasmissione>${formato}</FormatoTrasmissione>
      <CodiceDestinatario>${escXml(codDest)}</CodiceDestinatario>
      ${!snap.codice_sdi && snap.pec ? `<PECDestinatario>${escXml(snap.pec)}</PECDestinatario>` : ""}
    </DatiTrasmissione>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${escXml(azienda.partita_iva)}</IdCodice></IdFiscaleIVA>
        <CodiceFiscale>${escXml(azienda.codice_fiscale)}</CodiceFiscale>
        <Anagrafica><Denominazione>${escXml(azienda.ragione_sociale)}</Denominazione></Anagrafica>
        <RegimeFiscale>${escXml(azienda.regime_fiscale)}</RegimeFiscale>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>${escXml(azienda.indirizzo_via)}${azienda.indirizzo_numero_civico ? ` ${escXml(azienda.indirizzo_numero_civico)}` : ""}</Indirizzo>
        <CAP>${escXml(azienda.indirizzo_cap)}</CAP>
        <Comune>${escXml(azienda.indirizzo_comune)}</Comune>
        <Provincia>${escXml(azienda.indirizzo_provincia)}</Provincia>
        <Nazione>${escXml(azienda.indirizzo_nazione || "IT")}</Nazione>
      </Sede>
      ${azienda.codice_rea ? `<IscrizioneREA><Ufficio>${escXml(azienda.indirizzo_provincia)}</Ufficio><NumeroREA>${escXml(azienda.codice_rea)}</NumeroREA>${azienda.capitale_sociale ? `<CapitaleSociale>${fmtNum(azienda.capitale_sociale)}</CapitaleSociale><SocioUnico>SM</SocioUnico>` : ""}<StatoLiquidazione>LN</StatoLiquidazione></IscrizioneREA>` : ""}
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        ${snap.partita_iva ? `<IdFiscaleIVA><IdPaese>${escXml(snap.indirizzo_nazione || "IT")}</IdPaese><IdCodice>${escXml(snap.partita_iva)}</IdCodice></IdFiscaleIVA>` : ""}
        ${snap.codice_fiscale ? `<CodiceFiscale>${escXml(snap.codice_fiscale)}</CodiceFiscale>` : ""}
        <Anagrafica><Denominazione>${escXml(snap.ragione_sociale)}</Denominazione></Anagrafica>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>${escXml(snap.indirizzo_via)}</Indirizzo>
        <CAP>${escXml(snap.indirizzo_cap || "00000")}</CAP>
        <Comune>${escXml(snap.indirizzo_comune)}</Comune>
        ${snap.indirizzo_provincia ? `<Provincia>${escXml(snap.indirizzo_provincia)}</Provincia>` : ""}
        <Nazione>${escXml(snap.indirizzo_nazione || "IT")}</Nazione>
      </Sede>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>${tipoDoc}</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>${fmtDate(doc.data_emissione)}</Data>
        <Numero>${escXml(doc.numero)}</Numero>
        ${doc.ritenuta_acconto && doc.ritenuta_importo ? `<DatiRitenuta><TipoRitenuta>${escXml(doc.ritenuta_tipo || "RT01")}</TipoRitenuta><ImportoRitenuta>${fmtNum(doc.ritenuta_importo)}</ImportoRitenuta><AliquotaRitenuta>${fmtNum(doc.ritenuta_aliquota || 20)}</AliquotaRitenuta><CausalePagamento>${escXml(doc.ritenuta_causale || "A")}</CausalePagamento></DatiRitenuta>` : ""}
        ${doc.bollo_virtuale ? `<DatiBollo><BolloVirtuale>SI</BolloVirtuale><ImportoBollo>${fmtNum(doc.bollo_importo || 2)}</ImportoBollo></DatiBollo>` : ""}
        <ImportoTotaleDocumento>${fmtNum(doc.totale_documento)}</ImportoTotaleDocumento>
      </DatiGeneraliDocumento>
      ${(doc.cig || doc.cup) ? `<DatiOrdineAcquisto><IdDocumento>0</IdDocumento>${doc.cig ? `<CodiceCIG>${escXml(doc.cig)}</CodiceCIG>` : ""}${doc.cup ? `<CodiceCUP>${escXml(doc.cup)}</CodiceCUP>` : ""}</DatiOrdineAcquisto>` : ""}
    </DatiGenerali>
    <DatiBeniServizi>
${righe.map((r: any, i: number) => `      <DettaglioLinee>
        <NumeroLinea>${i + 1}</NumeroLinea>
        ${r.codice_articolo ? `<CodiceArticolo><CodiceTipo>INTERNO</CodiceTipo><CodiceValore>${escXml(r.codice_articolo)}</CodiceValore></CodiceArticolo>` : ""}
        <Descrizione>${escXml(r.descrizione)}</Descrizione>
        <Quantita>${fmtNum(r.quantita, 4)}</Quantita>
        ${r.unita_misura ? `<UnitaMisura>${escXml(r.unita_misura)}</UnitaMisura>` : ""}
        <PrezzoUnitario>${fmtNum(r.prezzo_unitario, 4)}</PrezzoUnitario>
        ${(r.sconto_percentuale || 0) > 0 ? `<ScontoMaggiorazione><Tipo>SC</Tipo><Percentuale>${fmtNum(r.sconto_percentuale)}</Percentuale></ScontoMaggiorazione>` : ""}
        <PrezzoTotale>${fmtNum(r.imponibile)}</PrezzoTotale>
        <AliquotaIVA>${fmtNum(parseFloat(r.aliquota_iva) || 0)}</AliquotaIVA>
        ${r.natura_iva ? `<Natura>${escXml(r.natura_iva)}</Natura>` : ""}
      </DettaglioLinee>`).join("\n")}
${riepilogo.map((r: any) => `      <DatiRiepilogo>
        <AliquotaIVA>${fmtNum(parseFloat(r.aliquota) || 0)}</AliquotaIVA>
        ${r.natura ? `<Natura>${escXml(r.natura)}</Natura>` : ""}
        <ImponibileImporto>${fmtNum(r.imponibile)}</ImponibileImporto>
        <Imposta>${fmtNum(r.imposta)}</Imposta>
        <EsigibilitaIVA>${r.esigibilita || "I"}</EsigibilitaIVA>
      </DatiRiepilogo>`).join("\n")}
    </DatiBeniServizi>
    ${scadenze.length > 0 || doc.metodo_pagamento_codice ? `<DatiPagamento>
      <CondizioniPagamento>${scadenze.length > 1 ? "TP02" : "TP01"}</CondizioniPagamento>
      ${scadenze.length > 0 ? scadenze.map((sc: any) => `<DettaglioPagamento>
        <ModalitaPagamento>${escXml(sc.metodo_pagamento || doc.metodo_pagamento_codice || "MP05")}</ModalitaPagamento>
        <DataScadenzaPagamento>${fmtDate(sc.data_scadenza)}</DataScadenzaPagamento>
        <ImportoPagamento>${fmtNum(sc.importo)}</ImportoPagamento>
        ${(sc.iban || doc.iban_pagamento) ? `<IBAN>${escXml(sc.iban || doc.iban_pagamento)}</IBAN>` : ""}
      </DettaglioPagamento>`).join("\n") : `<DettaglioPagamento>
        <ModalitaPagamento>${escXml(doc.metodo_pagamento_codice || "MP05")}</ModalitaPagamento>
        <ImportoPagamento>${fmtNum(doc.totale_da_pagare)}</ImportoPagamento>
        ${doc.iban_pagamento ? `<IBAN>${escXml(doc.iban_pagamento)}</IBAN>` : ""}
      </DettaglioPagamento>`}
    </DatiPagamento>` : ""}
  </FatturaElettronicaBody>
</p:FatturaElettronica>`;

  return xml;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Non autorizzato" }), { status: 401, headers: corsHeaders });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: authErr } = await supabase.auth.getClaims(token);
    if (authErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Non autorizzato" }), { status: 401, headers: corsHeaders });
    }
    const userId = claims.claims.sub;

    const { documento_id } = await req.json();
    if (!documento_id) {
      return new Response(JSON.stringify({ error: "documento_id obbligatorio" }), { status: 400, headers: corsHeaders });
    }

    // Load document
    const { data: doc, error: docErr } = await supabase
      .from("documenti_fiscali").select("*").eq("id", documento_id).single();
    if (docErr || !doc) {
      return new Response(JSON.stringify({ error: "Documento non trovato" }), { status: 404, headers: corsHeaders });
    }

    // Verify user belongs to this company
    try {
      await verifyCompanyAccess(supabase, userId, doc.company_id);
    } catch {
      return new Response(JSON.stringify({ error: "Non autorizzato: accesso negato a questo documento" }), { status: 403, headers: corsHeaders });
    }

    // Verify stato
    if (doc.stato !== "emessa") {
      return new Response(JSON.stringify({ error: "Il documento deve essere in stato 'emessa' per inviare a SDI" }), { status: 422, headers: corsHeaders });
    }

    // Load azienda
    const { data: azienda } = await supabase
      .from("anagrafica_azienda").select("*").eq("company_id", doc.company_id).single();
    if (!azienda) {
      return new Response(JSON.stringify({ error: "Anagrafica azienda non configurata" }), { status: 400, headers: corsHeaders });
    }

    // Generate XML
    const xml = generateXML(doc, azienda);

    // Save XML to storage
    const xmlPath = `${doc.company_id}/IT${azienda.partita_iva}_${(doc.numero || "").replace(/[^a-zA-Z0-9-]/g, "_")}.xml`;
    const { error: uploadErr } = await supabase.storage
      .from("fatture-xml")
      .upload(xmlPath, new Blob([xml], { type: "application/xml" }), { upsert: true });

    if (uploadErr) {
      console.error("XML upload error:", uploadErr);
    }

    let sdiId: string | null = null;
    let sdiErrors: any[] | null = null;

    // Route to provider
    const provider = azienda.sdi_provider || "manuale";

    if (provider === "aruba" && azienda.sdi_api_key) {
      // Aruba API call with 30s timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      try {
        const resp = await fetch("https://api.aruba.it/fatturaelectronica/v1/send", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${azienda.sdi_api_key}`,
            "Content-Type": "application/xml",
          },
          body: xml,
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (resp.ok) {
          const result = await resp.json();
          sdiId = result.id || result.identificativoSdI || crypto.randomUUID();
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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Success: update document
    await supabase.from("documenti_fiscali")
      .update({
        stato: "inviata_sdi",
        sdi_id_trasmissione: sdiId,
        sdi_file_xml_url: xmlPath,
        sdi_stato: "AT",
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
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("invia-sdi error:", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
