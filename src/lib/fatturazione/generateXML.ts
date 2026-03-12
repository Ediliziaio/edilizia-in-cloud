// src/lib/fatturazione/generateXML.ts
// FatturaPA 1.2 XML generator (client-side)

import type {
  DocumentoFiscale,
  AnagraficaAzienda,
  RigaDocumento,
  RiepilogoIVA,
  ScadenzaPagamento,
  TipoDocumento,
} from "@/types/fatturazione";

// ─── Helpers ─────────────────────────────────────────────────

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtNum(n: number, decimals = 2): string {
  return n.toFixed(decimals);
}

function fmtDate(d: string | undefined): string {
  if (!d) return "";
  // Ensure YYYY-MM-DD format
  return d.slice(0, 10);
}

// Maps internal tipo to SDI TipoDocumento code
const TIPO_TO_TD: Record<string, string> = {
  fattura: "TD01",
  fattura_pa: "TD01",
  nota_credito: "TD04",
  nota_debito: "TD05",
  autofattura: "TD20",
  fattura_riepilogativa: "TD24",
  ddt: "TD24",
};

// ─── Main Generator ──────────────────────────────────────────

export function generateFatturaPAXML(
  doc: DocumentoFiscale,
  azienda: AnagraficaAzienda
): string {
  const snap = doc.cliente_snapshot;
  const isPa = snap?.tipo_cliente === "PA";
  const formato = isPa ? "FPA12" : "FPR12";
  const codiceDestinatario = snap?.codice_sdi || (isPa ? "" : "0000000");
  const tipoDoc = TIPO_TO_TD[doc.tipo] || "TD01";
  const righe = doc.righe as RigaDocumento[];
  const riepilogo = doc.riepilogo_iva as RiepilogoIVA[];
  const scadenze = (doc.scadenze_pagamento ?? []) as ScadenzaPagamento[];

  // Build ProgressivoInvio from numero
  const progressivo = doc.numero?.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) || "00001";

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="${formato}" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <FatturaElettronicaHeader>
    <DatiTrasmissione>
      <IdTrasmittente>
        <IdPaese>IT</IdPaese>
        <IdCodice>${esc(azienda.partita_iva)}</IdCodice>
      </IdTrasmittente>
      <ProgressivoInvio>${esc(progressivo)}</ProgressivoInvio>
      <FormatoTrasmissione>${formato}</FormatoTrasmissione>
      <CodiceDestinatario>${esc(codiceDestinatario)}</CodiceDestinatario>`;

  // PEC if no SDI code
  if (!snap?.codice_sdi && snap?.pec) {
    xml += `
      <PECDestinatario>${esc(snap.pec)}</PECDestinatario>`;
  }

  xml += `
    </DatiTrasmissione>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA>
          <IdPaese>IT</IdPaese>
          <IdCodice>${esc(azienda.partita_iva)}</IdCodice>
        </IdFiscaleIVA>
        <CodiceFiscale>${esc(azienda.codice_fiscale)}</CodiceFiscale>
        <Anagrafica>
          <Denominazione>${esc(azienda.ragione_sociale)}</Denominazione>
        </Anagrafica>
        <RegimeFiscale>${esc(azienda.regime_fiscale)}</RegimeFiscale>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>${esc(azienda.indirizzo_via)}${azienda.indirizzo_numero_civico ? ` ${esc(azienda.indirizzo_numero_civico)}` : ""}</Indirizzo>
        <CAP>${esc(azienda.indirizzo_cap)}</CAP>
        <Comune>${esc(azienda.indirizzo_comune)}</Comune>
        <Provincia>${esc(azienda.indirizzo_provincia)}</Provincia>
        <Nazione>${esc(azienda.indirizzo_nazione || "IT")}</Nazione>
      </Sede>`;

  // IscrizioneREA
  if (azienda.codice_rea) {
    xml += `
      <IscrizioneREA>
        <Ufficio>${esc(azienda.indirizzo_provincia)}</Ufficio>
        <NumeroREA>${esc(azienda.codice_rea)}</NumeroREA>`;
    if (azienda.capitale_sociale) {
      xml += `
        <CapitaleSociale>${fmtNum(azienda.capitale_sociale)}</CapitaleSociale>
        <SocioUnico>SM</SocioUnico>`;
    }
    xml += `
        <StatoLiquidazione>LN</StatoLiquidazione>
      </IscrizioneREA>`;
  }

  xml += `
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>`;

  if (snap?.partita_iva) {
    xml += `
        <IdFiscaleIVA>
          <IdPaese>${esc(snap.indirizzo_nazione || "IT")}</IdPaese>
          <IdCodice>${esc(snap.partita_iva)}</IdCodice>
        </IdFiscaleIVA>`;
  }
  if (snap?.codice_fiscale) {
    xml += `
        <CodiceFiscale>${esc(snap.codice_fiscale)}</CodiceFiscale>`;
  }

  xml += `
        <Anagrafica>
          <Denominazione>${esc(snap?.ragione_sociale)}</Denominazione>
        </Anagrafica>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>${esc(snap?.indirizzo_via)}</Indirizzo>
        <CAP>${esc(snap?.indirizzo_cap || "00000")}</CAP>
        <Comune>${esc(snap?.indirizzo_comune)}</Comune>
        ${snap?.indirizzo_provincia ? `<Provincia>${esc(snap.indirizzo_provincia)}</Provincia>` : ""}
        <Nazione>${esc(snap?.indirizzo_nazione || "IT")}</Nazione>
      </Sede>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>${tipoDoc}</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>${fmtDate(doc.data_emissione)}</Data>
        <Numero>${esc(doc.numero)}</Numero>`;

  // Ritenuta
  if (doc.ritenuta_acconto && doc.ritenuta_importo) {
    xml += `
        <DatiRitenuta>
          <TipoRitenuta>${esc(doc.ritenuta_tipo || "RT01")}</TipoRitenuta>
          <ImportoRitenuta>${fmtNum(doc.ritenuta_importo)}</ImportoRitenuta>
          <AliquotaRitenuta>${fmtNum(doc.ritenuta_aliquota || 20)}</AliquotaRitenuta>
          <CausalePagamento>${esc(doc.ritenuta_causale || "A")}</CausalePagamento>
        </DatiRitenuta>`;
  }

  // Bollo
  if (doc.bollo_virtuale) {
    xml += `
        <DatiBollo>
          <BolloVirtuale>SI</BolloVirtuale>
          <ImportoBollo>${fmtNum(doc.bollo_importo || 2)}</ImportoBollo>
        </DatiBollo>`;
  }

  // Cassa previdenziale
  if (doc.cassa_previdenziale && doc.cassa_importo) {
    xml += `
        <DatiCassaPrevidenziale>
          <TipoCassa>${esc(doc.cassa_tipo || "TC22")}</TipoCassa>
          <AlCassa>${fmtNum(doc.cassa_aliquota || 4)}</AlCassa>
          <ImportoContributoCassa>${fmtNum(doc.cassa_importo)}</ImportoContributoCassa>
          <ImponibileCassa>${fmtNum(doc.cassa_imponibile || doc.imponibile_totale)}</ImponibileCassa>
          <AliquotaIVA>${fmtNum(parseFloat(doc.cassa_aliquota_iva || "22"))}</AliquotaIVA>
          ${doc.cassa_ritenuta ? "<Ritenuta>SI</Ritenuta>" : ""}
        </DatiCassaPrevidenziale>`;
  }

  // Sconto globale
  if ((doc.sconto_globale_valore ?? 0) > 0) {
    xml += `
        <ScontoMaggiorazione>
          <Tipo>SC</Tipo>
          ${doc.sconto_globale_percentuale ? `<Percentuale>${fmtNum(doc.sconto_globale_percentuale)}</Percentuale>` : ""}
          <Importo>${fmtNum(doc.sconto_globale_valore || 0)}</Importo>
        </ScontoMaggiorazione>`;
  }

  xml += `
        <ImportoTotaleDocumento>${fmtNum(doc.totale_documento)}</ImportoTotaleDocumento>`;

  // Causali
  const causali = (doc.causale ?? []) as string[];
  for (const c of causali) {
    xml += `
        <Causale>${esc(c)}</Causale>`;
  }

  xml += `
      </DatiGeneraliDocumento>`;

  // DatiOrdineAcquisto
  const ordini = (doc.riferimenti_ordine ?? []) as Array<Record<string, unknown>>;
  for (const o of ordini) {
    xml += `
      <DatiOrdineAcquisto>
        ${o.IdDocumento ? `<IdDocumento>${esc(String(o.IdDocumento))}</IdDocumento>` : ""}
        ${o.Data ? `<Data>${fmtDate(String(o.Data))}</Data>` : ""}
        ${doc.cig ? `<CodiceCIG>${esc(doc.cig)}</CodiceCIG>` : ""}
        ${doc.cup ? `<CodiceCUP>${esc(doc.cup)}</CodiceCUP>` : ""}
      </DatiOrdineAcquisto>`;
  }

  // CIG/CUP without order reference (PA)
  if (ordini.length === 0 && (doc.cig || doc.cup)) {
    xml += `
      <DatiOrdineAcquisto>
        <IdDocumento>0</IdDocumento>
        ${doc.cig ? `<CodiceCIG>${esc(doc.cig)}</CodiceCIG>` : ""}
        ${doc.cup ? `<CodiceCUP>${esc(doc.cup)}</CodiceCUP>` : ""}
      </DatiOrdineAcquisto>`;
  }

  // DatiDDT
  const ddts = (doc.riferimenti_ddt ?? []) as Array<Record<string, unknown>>;
  for (const d of ddts) {
    xml += `
      <DatiDDT>
        ${d.NumeroDDT ? `<NumeroDDT>${esc(String(d.NumeroDDT))}</NumeroDDT>` : ""}
        ${d.DataDDT ? `<DataDDT>${fmtDate(String(d.DataDDT))}</DataDDT>` : ""}
      </DatiDDT>`;
  }

  xml += `
    </DatiGenerali>
    <DatiBeniServizi>`;

  // DettaglioLinee
  righe.forEach((r, i) => {
    xml += `
      <DettaglioLinee>
        <NumeroLinea>${i + 1}</NumeroLinea>`;

    if (r.codice_articolo) {
      xml += `
        <CodiceArticolo>
          <CodiceTipo>INTERNO</CodiceTipo>
          <CodiceValore>${esc(r.codice_articolo)}</CodiceValore>
        </CodiceArticolo>`;
    }

    xml += `
        <Descrizione>${esc(r.descrizione)}</Descrizione>
        <Quantita>${fmtNum(r.quantita, 4)}</Quantita>
        ${r.unita_misura ? `<UnitaMisura>${esc(r.unita_misura)}</UnitaMisura>` : ""}
        <PrezzoUnitario>${fmtNum(r.prezzo_unitario, 4)}</PrezzoUnitario>`;

    if ((r.sconto_percentuale ?? 0) > 0) {
      xml += `
        <ScontoMaggiorazione>
          <Tipo>SC</Tipo>
          <Percentuale>${fmtNum(r.sconto_percentuale!)}</Percentuale>
        </ScontoMaggiorazione>`;
    }

    xml += `
        <PrezzoTotale>${fmtNum(r.imponibile)}</PrezzoTotale>
        <AliquotaIVA>${fmtNum(parseFloat(r.aliquota_iva) || 0)}</AliquotaIVA>`;

    if (r.ritenuta) {
      xml += `
        <Ritenuta>SI</Ritenuta>`;
    }

    if (r.natura_iva) {
      xml += `
        <Natura>${esc(r.natura_iva)}</Natura>`;
    }

    if (r.riferimento_amministrazione) {
      xml += `
        <RiferimentoAmministrazione>${esc(r.riferimento_amministrazione)}</RiferimentoAmministrazione>`;
    }

    xml += `
      </DettaglioLinee>`;
  });

  // DatiRiepilogo
  for (const r of riepilogo) {
    xml += `
      <DatiRiepilogo>
        <AliquotaIVA>${fmtNum(parseFloat(r.aliquota) || 0)}</AliquotaIVA>`;

    if (r.natura) {
      xml += `
        <Natura>${esc(r.natura)}</Natura>`;
    }

    xml += `
        <ImponibileImporto>${fmtNum(r.imponibile)}</ImponibileImporto>
        <Imposta>${fmtNum(r.imposta)}</Imposta>
        <EsigibilitaIVA>${r.esigibilita || "I"}</EsigibilitaIVA>`;

    if (r.riferimento_normativo) {
      xml += `
        <RiferimentoNormativo>${esc(r.riferimento_normativo)}</RiferimentoNormativo>`;
    }

    xml += `
      </DatiRiepilogo>`;
  }

  xml += `
    </DatiBeniServizi>`;

  // DatiPagamento
  if (scadenze.length > 0 || doc.metodo_pagamento_codice) {
    const condizioni = scadenze.length > 1 ? "TP02" : "TP01";
    xml += `
    <DatiPagamento>
      <CondizioniPagamento>${condizioni}</CondizioniPagamento>`;

    if (scadenze.length > 0) {
      for (const sc of scadenze) {
        xml += `
      <DettaglioPagamento>
        <ModalitaPagamento>${esc(sc.metodo_pagamento || doc.metodo_pagamento_codice || "MP05")}</ModalitaPagamento>
        <DataScadenzaPagamento>${fmtDate(sc.data_scadenza)}</DataScadenzaPagamento>
        <ImportoPagamento>${fmtNum(sc.importo)}</ImportoPagamento>`;

        if (sc.iban || doc.iban_pagamento) {
          xml += `
        <IBAN>${esc(sc.iban || doc.iban_pagamento)}</IBAN>`;
        }
        if (sc.istituto_finanziario || doc.nome_banca) {
          xml += `
        <IstitutoFinanziario>${esc(sc.istituto_finanziario || doc.nome_banca)}</IstitutoFinanziario>`;
        }

        xml += `
      </DettaglioPagamento>`;
      }
    } else {
      xml += `
      <DettaglioPagamento>
        <ModalitaPagamento>${esc(doc.metodo_pagamento_codice || "MP05")}</ModalitaPagamento>
        <ImportoPagamento>${fmtNum(doc.totale_da_pagare)}</ImportoPagamento>`;
      if (doc.iban_pagamento) {
        xml += `
        <IBAN>${esc(doc.iban_pagamento)}</IBAN>`;
      }
      if (doc.nome_banca) {
        xml += `
        <IstitutoFinanziario>${esc(doc.nome_banca)}</IstitutoFinanziario>`;
      }
      xml += `
      </DettaglioPagamento>`;
    }

    xml += `
    </DatiPagamento>`;
  }

  // Allegati
  const allegati = (doc.allegati ?? []) as Array<Record<string, unknown>>;
  for (const a of allegati) {
    if (a.nome && a.contenuto) {
      xml += `
    <Allegati>
      <NomeAttachment>${esc(String(a.nome))}</NomeAttachment>
      <FormatoAttachment>${esc(String(a.formato || "PDF"))}</FormatoAttachment>
      <Attachment>${String(a.contenuto)}</Attachment>
    </Allegati>`;
    }
  }

  xml += `
  </FatturaElettronicaBody>
</p:FatturaElettronica>`;

  return xml;
}

// ─── Validation ──────────────────────────────────────────────

export interface XMLValidationError {
  field: string;
  message: string;
}

export function validateXML(xml: string): XMLValidationError[] {
  const errors: XMLValidationError[] = [];

  const requiredElements = [
    "IdTrasmittente",
    "ProgressivoInvio",
    "FormatoTrasmissione",
    "CodiceDestinatario",
    "CedentePrestatore",
    "CessionarioCommittente",
    "TipoDocumento",
    "Divisa",
    "Data",
    "Numero",
    "DettaglioLinee",
    "DatiRiepilogo",
  ];

  for (const el of requiredElements) {
    if (!xml.includes(`<${el}>`)) {
      errors.push({ field: el, message: `Elemento obbligatorio mancante: ${el}` });
    }
  }

  // Check for empty required values
  if (xml.includes("<IdCodice></IdCodice>")) {
    errors.push({ field: "IdCodice", message: "P.IVA cedente mancante" });
  }
  if (xml.includes("<Denominazione></Denominazione>")) {
    errors.push({ field: "Denominazione", message: "Denominazione mancante" });
  }

  return errors;
}
