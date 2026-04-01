// supabase/functions/_shared/generateXML.ts
// Generatore XML FatturaPA condiviso tra Edge Functions (invia-sdi, generate-invoice-pdf, ecc.)
// Il client-side usa src/lib/fatturazione/generateXML.ts (non può importare questo modulo Deno)

export function escXml(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function fmtNum(n: number, d = 2): string { return n.toFixed(d); }
export function fmtDate(d: string | null | undefined): string { return d ? d.slice(0, 10) : ""; }
export function naturaToXml(n: string): string { return n.replace(/_/g, "."); }

export const TIPO_TO_TD: Record<string, string> = {
  fattura: "TD01", fattura_pa: "TD01",
  acconto_fattura: "TD02",
  acconto_parcella: "TD03",
  nota_credito: "TD04", nota_debito: "TD05",
  parcella: "TD06",
  reverse_charge_interno: "TD16",
  integrazione_servizi_estero: "TD17", integrazione_beni_ue: "TD18",
  integrazione_beni_extra_ue: "TD19",
  autofattura: "TD20",
  autofattura_splafonamento: "TD21",
  fattura_riepilogativa: "TD24", ddt: "TD24", fattura_accompagnatoria: "TD24",
  fattura_differita_b: "TD25",
  autoconsumo: "TD27",
};

export const TIPI_INVERSIONE = ["TD17", "TD18", "TD19"];

/**
 * Genera l'XML FatturaPA (FPR12/FPA12) a partire dal documento e dall'anagrafica azienda.
 * Usato sia dal server (Edge Function invia-sdi) che dai generatori PDF.
 * Il `progressivoInvio` è obbligatorio per l'invio reale; in preview si usa il numero documento.
 */
export function generateXML(
  doc: Record<string, any>,
  azienda: Record<string, any>,
  progressivoInvio?: string
): string {
  const snap = doc.cliente_snapshot || {};
  const tipoDoc = TIPO_TO_TD[doc.tipo] || "TD01";
  const isInversione = TIPI_INVERSIONE.includes(tipoDoc);
  const isPa = !isInversione && snap.tipo_cliente === "PA";
  const formato = isInversione ? "FPR12" : (isPa ? "FPA12" : "FPR12");
  const codDest = isInversione
    ? (azienda.codice_sdi || "0000000")
    : (snap.codice_sdi || (isPa ? "000000" : "0000000"));
  const righe: any[] = doc.righe || [];
  const scadenze: any[] = doc.scadenze_pagamento || [];

  // Split payment: se PA e split_payment_pa attivo, forza EsigibilitaIVA = "S"
  const applySplitPayment = isPa && (azienda.split_payment_pa !== false);
  const riepilogo: any[] = (doc.riepilogo_iva || []).map((r: any) => {
    if (applySplitPayment && !r.natura && (parseFloat(r.aliquota) || 0) > 0) {
      return { ...r, esigibilita: "S" };
    }
    return r;
  });

  const progressivo = progressivoInvio || (doc.numero || "00001").replace(/[^a-zA-Z0-9]/g, "").slice(0, 10);

  function anagraficaXml(ragioneSociale: string, nome?: string, cognome?: string): string {
    if (nome && cognome) {
      return `<Nome>${escXml(nome)}</Nome><Cognome>${escXml(cognome)}</Cognome>`;
    }
    return `<Denominazione>${escXml(ragioneSociale)}</Denominazione>`;
  }

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="${formato}" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <FatturaElettronicaHeader>
    <DatiTrasmissione>
      <IdTrasmittente><IdPaese>IT</IdPaese><IdCodice>${escXml(azienda.partita_iva)}</IdCodice></IdTrasmittente>
      <ProgressivoInvio>${escXml(progressivo)}</ProgressivoInvio>
      <FormatoTrasmissione>${formato}</FormatoTrasmissione>
      <CodiceDestinatario>${escXml(codDest)}</CodiceDestinatario>
      ${!isInversione && !snap.codice_sdi && snap.pec ? `<PECDestinatario>${escXml(snap.pec)}</PECDestinatario>` : ""}
    </DatiTrasmissione>`;

  if (isInversione) {
    xml += `
    <CedentePrestatore>
      <DatiAnagrafici>
        ${snap.partita_iva ? `<IdFiscaleIVA><IdPaese>${escXml(snap.indirizzo_nazione || "XX")}</IdPaese><IdCodice>${escXml(snap.partita_iva)}</IdCodice></IdFiscaleIVA>` : ""}
        ${snap.codice_fiscale ? `<CodiceFiscale>${escXml(snap.codice_fiscale)}</CodiceFiscale>` : ""}
        <Anagrafica><Denominazione>${escXml(snap.ragione_sociale || "Fornitore Estero")}</Denominazione></Anagrafica>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>${escXml(snap.indirizzo_via || "Estero")}</Indirizzo>
        <CAP>${escXml(snap.indirizzo_cap || "00000")}</CAP>
        <Comune>${escXml(snap.indirizzo_comune || "Estero")}</Comune>
        <Nazione>${escXml(snap.indirizzo_nazione || "XX")}</Nazione>
      </Sede>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${escXml(azienda.partita_iva)}</IdCodice></IdFiscaleIVA>
        ${azienda.codice_fiscale ? `<CodiceFiscale>${escXml(azienda.codice_fiscale)}</CodiceFiscale>` : ""}
        <Anagrafica><Denominazione>${escXml(azienda.ragione_sociale)}</Denominazione></Anagrafica>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>${escXml(azienda.indirizzo_via)}${azienda.indirizzo_numero_civico ? ` ${escXml(azienda.indirizzo_numero_civico)}` : ""}</Indirizzo>
        <CAP>${escXml(azienda.indirizzo_cap)}</CAP>
        <Comune>${escXml(azienda.indirizzo_comune)}</Comune>
        ${azienda.indirizzo_provincia ? `<Provincia>${escXml(azienda.indirizzo_provincia)}</Provincia>` : ""}
        <Nazione>IT</Nazione>
      </Sede>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>`;
  } else {
    xml += `
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
      ${azienda.codice_rea ? `<IscrizioneREA><Ufficio>${escXml(azienda.indirizzo_provincia)}</Ufficio><NumeroREA>${escXml(azienda.codice_rea)}</NumeroREA>${azienda.capitale_sociale ? `<CapitaleSociale>${fmtNum(azienda.capitale_sociale)}</CapitaleSociale><SocioUnico>${azienda.socio_unico ? "SU" : "SM"}</SocioUnico>` : ""}<StatoLiquidazione>LN</StatoLiquidazione></IscrizioneREA>` : ""}
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        ${snap.partita_iva ? `<IdFiscaleIVA><IdPaese>${escXml(snap.indirizzo_nazione || "IT")}</IdPaese><IdCodice>${escXml(snap.partita_iva)}</IdCodice></IdFiscaleIVA>` : ""}
        ${snap.codice_fiscale ? `<CodiceFiscale>${escXml(snap.codice_fiscale)}</CodiceFiscale>` : ""}
        <Anagrafica>${anagraficaXml(snap.ragione_sociale, snap.nome, snap.cognome)}</Anagrafica>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>${escXml(snap.indirizzo_via)}</Indirizzo>
        <CAP>${escXml(snap.indirizzo_cap || "00000")}</CAP>
        <Comune>${escXml(snap.indirizzo_comune)}</Comune>
        ${snap.indirizzo_provincia ? `<Provincia>${escXml(snap.indirizzo_provincia)}</Provincia>` : ""}
        <Nazione>${escXml(snap.indirizzo_nazione || "IT")}</Nazione>
      </Sede>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>`;
  }

  xml += `
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>${tipoDoc}</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>${fmtDate(doc.data_emissione)}</Data>
        <Numero>${escXml(doc.numero)}</Numero>
        ${doc.ritenuta_acconto && doc.ritenuta_importo ? `<DatiRitenuta><TipoRitenuta>${escXml(doc.ritenuta_tipo || "RT01")}</TipoRitenuta><ImportoRitenuta>${fmtNum(doc.ritenuta_importo)}</ImportoRitenuta><AliquotaRitenuta>${fmtNum(doc.ritenuta_aliquota || 20)}</AliquotaRitenuta><CausalePagamento>${escXml(doc.ritenuta_causale || "A")}</CausalePagamento></DatiRitenuta>` : ""}
        ${doc.altra_ritenuta && doc.altra_ritenuta_importo ? `<DatiRitenuta><TipoRitenuta>${escXml(doc.altra_ritenuta_tipo || "RT03")}</TipoRitenuta><ImportoRitenuta>${fmtNum(doc.altra_ritenuta_importo)}</ImportoRitenuta><AliquotaRitenuta>${fmtNum(doc.altra_ritenuta_aliquota || 0)}</AliquotaRitenuta><CausalePagamento>${escXml(doc.altra_ritenuta_causale || "A")}</CausalePagamento></DatiRitenuta>` : ""}
        ${doc.bollo_virtuale ? `<DatiBollo><BolloVirtuale>SI</BolloVirtuale><ImportoBollo>${fmtNum(doc.bollo_importo || 2)}</ImportoBollo></DatiBollo>` : ""}
        ${doc.cassa_previdenziale && doc.cassa_importo ? `<DatiCassaPrevidenziale><TipoCassa>${escXml(doc.cassa_tipo || "TC22")}</TipoCassa><AlCassa>${fmtNum(doc.cassa_aliquota || 4)}</AlCassa><ImportoContributoCassa>${fmtNum(doc.cassa_importo)}</ImportoContributoCassa><ImponibileCassa>${fmtNum(doc.cassa_imponibile || doc.imponibile_totale)}</ImponibileCassa><AliquotaIVA>${fmtNum(parseFloat(doc.cassa_aliquota_iva || "22"))}</AliquotaIVA>${doc.cassa_ritenuta ? "<Ritenuta>SI</Ritenuta>" : ""}</DatiCassaPrevidenziale>` : ""}
        ${doc.rivalsa_inps && doc.rivalsa_importo ? `<DatiCassaPrevidenziale><TipoCassa>${escXml(doc.rivalsa_tipo || "TC22")}</TipoCassa><AlCassa>${fmtNum(doc.rivalsa_aliquota || 4)}</AlCassa><ImportoContributoCassa>${fmtNum(doc.rivalsa_importo)}</ImportoContributoCassa><ImponibileCassa>${fmtNum(doc.imponibile_totale)}</ImponibileCassa><AliquotaIVA>${fmtNum(22)}</AliquotaIVA></DatiCassaPrevidenziale>` : ""}
        ${(doc.sconto_globale_valore || 0) > 0 ? `<ScontoMaggiorazione><Tipo>SC</Tipo>${doc.sconto_globale_percentuale ? `<Percentuale>${fmtNum(doc.sconto_globale_percentuale)}</Percentuale>` : ""}<Importo>${fmtNum(doc.sconto_globale_valore || 0)}</Importo></ScontoMaggiorazione>` : ""}
        <ImportoTotaleDocumento>${fmtNum(doc.totale_documento)}</ImportoTotaleDocumento>${azienda.regime_fiscale === "RF19" ? `
        <Causale>${escXml("Operazione effettuata ai sensi dell'art. 1, commi da 54 a 89, della legge 23 dicembre 2014, n. 190 — Regime forfettario")}</Causale>` : ""}
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
        ${r.natura_iva ? `<Natura>${escXml(naturaToXml(r.natura_iva))}</Natura>` : ""}
      </DettaglioLinee>`).join("\n")}
${riepilogo.map((r: any) => `      <DatiRiepilogo>
        <AliquotaIVA>${fmtNum(parseFloat(r.aliquota) || 0)}</AliquotaIVA>
        ${r.natura ? `<Natura>${escXml(naturaToXml(r.natura))}</Natura>` : ""}
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
