// supabase/functions/_shared/generateXML.ts
// Generatore XML FatturaPA 1.2.2 — uno solo per tutta l'app: lo usano l'invio
// allo SDI (invia-sdi) e il pulsante «Scarica XML» (src/lib/fatturazione/
// generateXML.ts). Niente import Deno: gira anche nel browser e nei test.
//
// 24/09/2026, prima fattura vera con openapi (Renova Solution). Le fatture di
// prova validate contro lo schema ufficiale dell'Agenzia e contro i controlli di
// calcolo dello SDI: 7 su 15 sarebbero state scartate, e molte partivano senza
// dati che la legge chiede. Il generatore dell'anteprima, intanto, ne sapeva di
// più di quello che spediva: l'anteprima mostrava una fattura diversa da quella
// inviata. Le correzioni sono scritte vicino a ogni blocco.

import { iscrizioneRea } from "./datiSocietari.ts";

type Dati = Record<string, any>;

export function escXml(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function fmtNum(n: number, d = 2): string { return (Number(n) || 0).toFixed(d); }
export function fmtDate(d: string | null | undefined): string { return d ? d.slice(0, 10) : ""; }
export function naturaToXml(n: string): string { return n.replace(/_/g, "."); }

/**
 * Importo con due-otto decimali (Amount8DecimalType): i prezzi unitari e gli
 * sconti per unità hanno spesso più di due decimali, e troncarli a quattro
 * faceva sbagliare PrezzoTotale oltre il centesimo (scarto 00423).
 */
export function fmtNum8(n: number): string {
  const s = (Number(n) || 0).toFixed(8).replace(/0+$/, "");
  const [intera, decimali = ""] = s.split(".");
  return `${intera}.${decimali.padEnd(2, "0")}`;
}

/**
 * CAP come lo vuole lo schema FatturaPA: cinque cifre. I codici postali esteri
 * (lettere, spazi, lunghezze diverse) fanno scartare la fattura, e per i clienti
 * non residenti la regola è proprio scrivere 00000.
 */
export function capSdi(cap?: string | null, nazione?: string | null): string {
  const estero = String(nazione || "IT").toUpperCase() !== "IT";
  const pulito = String(cap || "").replace(/\D/g, "");
  if (estero || pulito.length !== 5) return "00000";
  return pulito;
}

// ─── Testo ammesso dallo schema ─────────────────────────────────────────────
//
// Lo schema 1.2.2 accetta nei campi di testo solo Basic Latin e Latin-1
// Supplement: le lettere accentate italiane sì, ma non l'apostrofo curvo che
// scrive l'iPhone («dell’infisso»), il trattino lungo, l'euro, i puntini di
// sospensione. Una sola di queste lettere e lo SDI scarta tutta la fattura.
// E ogni campo ha la sua lunghezza massima (Denominazione 80, Descrizione 1000…).

const SOSTITUZIONI: Array<[RegExp, string]> = [
  [/[‘’‚‛′ʼ]/g, "'"],
  [/[“”„‟″«»]/g, '"'],
  [/[‐-―−]/g, "-"],
  [/…/g, "..."],
  [/€/g, "EUR"],
  [/[•‣⁃▪●◦]/g, "-"],
  [/™/g, "TM"],
  [/[  -​  　]/g, " "],
  [/[\u0000-\u001F\u007F]/g, " "],
];

/** Testo come lo accetta lo schema: caratteri latini, una riga, al massimo `max` caratteri. */
export function testoSdi(valore: unknown, max: number): string {
  let t = String(valore ?? "");
  for (const [re, sub] of SOSTITUZIONI) t = t.replace(re, sub);
  // Lettere fuori Latin-1 (ł, ő, ě…): si toglie il segno diacritico; se non resta
  // una lettera latina, il carattere cade.
  t = Array.from(t)
    .map((ch) => ((ch.codePointAt(0) ?? 0) <= 0xff ? ch : ch.normalize("NFKD").replace(/[^ -ÿ]/g, "")))
    .join("");
  t = t.replace(/\s+/g, " ").trim();
  if (t.length > max) t = `${t.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
  return t;
}

/** testoSdi già pronto per stare dentro un elemento XML. */
function x(valore: unknown, max: number): string {
  return escXml(testoSdi(valore, max));
}

/** Testi lunghi (Causale: 200 caratteri) spezzati in più elementi, senza tagliare le parole. */
function aPezzi(valore: unknown, max: number): string[] {
  const t = testoSdi(valore, 100_000);
  const pezzi: string[] = [];
  let resto = t;
  while (resto.length > max) {
    let taglio = resto.lastIndexOf(" ", max);
    if (taglio < max * 0.6) taglio = max;
    pezzi.push(resto.slice(0, taglio).trim());
    resto = resto.slice(taglio).trim();
  }
  if (resto) pezzi.push(resto);
  return pezzi;
}

/** Codice paese ISO a due lettere, maiuscolo. */
function paese(v: unknown, riserva = "IT"): string {
  const p = String(v ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(p) ? p : riserva;
}

/**
 * Identificativo IVA senza spazi né prefisso del paese: «ATU12345678» con paese
 * AT diventa «U12345678» (il paese va in IdPaese, non nel codice).
 */
function idCodiceIva(piva: unknown, nazione: string): string {
  let c = String(piva ?? "").replace(/[\s.\-/]/g, "").toUpperCase();
  if (c.length > 2 && c.startsWith(nazione)) c = c.slice(2);
  return c.slice(0, 28);
}

// ─── Riferimenti normativi ──────────────────────────────────────────────────
//
// Per le operazioni senza IVA la fattura deve indicare la norma (art. 21 c.6
// DPR 633/72): nell'XML sta in RiferimentoNormativo, massimo 100 caratteri. Se
// la riga del riepilogo non ne porta uno scritto a mano, vale quello della natura.
export const RIFERIMENTO_NORMATIVO: Record<string, string> = {
  "N1": "Escluse ex art. 15 DPR 633/72",
  "N2.1": "Non soggette art. 7-7septies DPR 633/72",
  "N2.2": "Non soggette - altri casi",
  "N3.1": "Non imponibili art. 8 c.1 lett. a-b DPR 633/72",
  "N3.2": "Non imponibili art. 41 DL 331/93",
  "N3.3": "Non imponibili art. 71 DPR 633/72",
  "N3.4": "Non imponibili art. 8-bis, 9, 72 DPR 633/72",
  "N3.5": "Non imponibili art. 8 c.1 lett. c DPR 633/72",
  "N3.6": "Non imponibili - altre operazioni",
  "N4": "Esenti art. 10 DPR 633/72",
  "N5": "Regime del margine artt. 36-40 DL 41/95",
  "N6.1": "Inversione contabile art. 74 c.7-8 DPR 633/72",
  "N6.2": "Inversione contabile art. 17 c.5 DPR 633/72",
  "N6.3": "Inversione contabile art. 17 c.6 lett. a DPR 633/72",
  "N6.4": "Inversione contabile art. 17 c.6 lett. a-bis DPR 633/72",
  "N6.5": "Inversione contabile art. 17 c.6 lett. b DPR 633/72",
  "N6.6": "Inversione contabile art. 17 c.6 lett. c DPR 633/72",
  "N6.7": "Inversione contabile art. 17 c.6 lett. a-ter DPR 633/72",
  "N6.8": "Inversione contabile art. 17 c.6 lett. d-bis, d-ter, d-quater DPR 633/72",
  "N6.9": "Inversione contabile art. 17 DPR 633/72",
  "N7": "IVA assolta in altro Stato UE",
};

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

/**
 * Documenti che il cliente emette per conto del fornitore: CedentePrestatore è
 * il FORNITORE, CessionarioCommittente siamo noi, e il documento torna al nostro
 * codice destinatario. TD16 (integrazione di una fattura in reverse charge
 * ricevuta, per esempio da un subappaltatore) e TD20 (autofattura per
 * regolarizzazione) erano trattati come fatture nostre verso il cliente.
 */
export const TIPI_INVERSIONE = ["TD16", "TD17", "TD18", "TD19", "TD20"];
/** Fornitore estero: regime RF18, e IdCodice di riserva se non ha partita IVA. */
const TIPI_FORNITORE_ESTERO = ["TD17", "TD18", "TD19"];

const MODALITA_PAGAMENTO = /^MP(0[1-9]|1\d|2[0-3])$/;
const IBAN = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/;

/** Stesso sconto per riga di calcolaRiga (src/lib/fatturazione/calcoli.ts): percentuale, se c'è, altrimenti importo. */
function scontoRiga(r: Dati): { percentuale?: number; importo?: number } {
  const perc = Number(r.sconto_percentuale) || 0;
  if (perc > 0) return { percentuale: perc };
  const valore = Number(r.sconto_valore) || 0;
  if (valore > 0) return { importo: valore };
  return {};
}

/**
 * <IscrizioneREA> del cedente (art. 2250 c.c.): ufficio e numero del registro
 * imprese, per S.p.A. e S.r.l. anche capitale versato e unico socio, e lo stato
 * di liquidazione. Prima l'ufficio era sempre la provincia della sede, lo
 * stato sempre «non in liquidazione», e per le società di persone usciva un
 * SocioUnico che le specifiche riservano a S.p.A. e S.r.l.
 */
function bloccoRea(azienda: Dati): string {
  const rea = iscrizioneRea(azienda);
  if (!rea) return "";
  return `<IscrizioneREA><Ufficio>${rea.ufficio}</Ufficio><NumeroREA>${escXml(rea.numero)}</NumeroREA>` +
    (rea.capitale !== null ? `<CapitaleSociale>${fmtNum(rea.capitale)}</CapitaleSociale>` : "") +
    (rea.socioUnico ? `<SocioUnico>${rea.socioUnico}</SocioUnico>` : "") +
    `<StatoLiquidazione>${rea.stato}</StatoLiquidazione></IscrizioneREA>`;
}

/**
 * Genera l'XML FatturaPA (FPR12/FPA12) a partire dal documento e dall'anagrafica azienda.
 * Il `progressivoInvio` è obbligatorio per l'invio reale; in anteprima si usa il numero documento.
 * `doc.fattura_collegata` ({ numero, data }), se c'è, è la fattura che una nota
 * di credito o di debito rettifica: la carica invia-sdi.
 */
export function generateXML(
  doc: Dati,
  azienda: Dati,
  progressivoInvio?: string
): string {
  const snap: Dati = doc.cliente_snapshot || {};
  const tipoDoc = TIPO_TO_TD[doc.tipo] || "TD01";
  const isInversione = TIPI_INVERSIONE.includes(tipoDoc);
  const fornitoreEstero = TIPI_FORNITORE_ESTERO.includes(tipoDoc);
  const isPa = !isInversione && snap.tipo_cliente === "PA";
  const formato = isPa ? "FPA12" : "FPR12";
  const nazioneCliente = paese(snap.indirizzo_nazione, fornitoreEstero ? "XX" : "IT");
  // Cliente non residente: lo SDI vuole sette X come CodiceDestinatario, non i
  // sette zeri che valgono per chi in Italia non ha un canale telematico. Con
  // gli zeri la fattura verso l'estero viene scartata.
  const clienteEstero = !isInversione && nazioneCliente !== "IT";
  const codiceSdiCliente = String(snap.codice_sdi || "").trim().toUpperCase();
  const codDest = isInversione
    ? (String(azienda.codice_sdi || "").trim().toUpperCase() || "0000000")
    : clienteEstero
      ? "XXXXXXX"
      : (codiceSdiCliente || (isPa ? "000000" : "0000000"));
  const righe: Dati[] = doc.righe || [];
  const scadenze: Dati[] = doc.scadenze_pagamento || [];

  // Split payment: se PA e split_payment_pa attivo, forza EsigibilitaIVA = "S"
  const applySplitPayment = isPa && (azienda.split_payment_pa !== false);
  const riepilogo: Dati[] = (doc.riepilogo_iva || []).map((r: Dati) => {
    if (applySplitPayment && !r.natura && (parseFloat(r.aliquota) || 0) > 0) {
      return { ...r, esigibilita: "S" };
    }
    return r;
  });

  const progressivo = testoSdi(progressivoInvio || (doc.numero || "00001").replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) || "00001", 10);

  const anagrafica = (s: Dati, ragioneSociale?: string): string =>
    s.nome && s.cognome
      ? `<Nome>${x(s.nome, 60)}</Nome><Cognome>${x(s.cognome, 60)}</Cognome>`
      : `<Denominazione>${x(ragioneSociale ?? s.ragione_sociale, 80)}</Denominazione>`;

  const provinciaIt = (p: unknown, nazione: string): string => {
    const v = String(p ?? "").trim().toUpperCase();
    return nazione === "IT" && /^[A-Z]{2}$/.test(v) ? `<Provincia>${v}</Provincia>` : "";
  };

  const sedeAzienda = `<Sede>
        <Indirizzo>${x(`${azienda.indirizzo_via || ""}${azienda.indirizzo_numero_civico ? ` ${azienda.indirizzo_numero_civico}` : ""}`, 60)}</Indirizzo>
        <CAP>${escXml(capSdi(azienda.indirizzo_cap, "IT"))}</CAP>
        <Comune>${x(azienda.indirizzo_comune, 60)}</Comune>
        ${provinciaIt(azienda.indirizzo_provincia, "IT")}
        <Nazione>IT</Nazione>
      </Sede>`;

  const sedeCliente = `<Sede>
        <Indirizzo>${x(snap.indirizzo_via, 60)}</Indirizzo>
        <CAP>${escXml(capSdi(snap.indirizzo_cap, nazioneCliente))}</CAP>
        <Comune>${x(snap.indirizzo_comune, 60)}</Comune>
        ${provinciaIt(snap.indirizzo_provincia, nazioneCliente)}
        <Nazione>${nazioneCliente}</Nazione>
      </Sede>`;

  const idIvaCliente = snap.partita_iva
    ? idCodiceIva(snap.partita_iva, nazioneCliente)
    : fornitoreEstero ? "99999999999" : "";
  // Il codice fiscale ha un formato italiano: per i soggetti esteri non si scrive.
  const cfCliente = String(snap.codice_fiscale || "").replace(/\s/g, "").toUpperCase();
  const cfClienteXml = nazioneCliente === "IT" && /^[A-Z0-9]{11,16}$/.test(cfCliente)
    ? `<CodiceFiscale>${cfCliente}</CodiceFiscale>` : "";

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="${formato}" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <FatturaElettronicaHeader>
    <DatiTrasmissione>
      <IdTrasmittente><IdPaese>IT</IdPaese><IdCodice>${escXml(azienda.partita_iva)}</IdCodice></IdTrasmittente>
      <ProgressivoInvio>${escXml(progressivo)}</ProgressivoInvio>
      <FormatoTrasmissione>${formato}</FormatoTrasmissione>
      <CodiceDestinatario>${escXml(codDest)}</CodiceDestinatario>
      ${!isInversione && !clienteEstero && !codiceSdiCliente && snap.pec ? `<PECDestinatario>${x(snap.pec, 256)}</PECDestinatario>` : ""}
    </DatiTrasmissione>`;

  if (isInversione) {
    // Il fornitore: RegimeFiscale è obbligatorio anche qui (lo schema scartava
    // TD17/18/19 senza), RF18 «altro» per l'estero; IdFiscaleIVA pure, con il
    // codice di riserva 99999999999 per il fornitore estero senza partita IVA.
    xml += `
    <CedentePrestatore>
      <DatiAnagrafici>
        ${idIvaCliente ? `<IdFiscaleIVA><IdPaese>${nazioneCliente}</IdPaese><IdCodice>${escXml(idIvaCliente)}</IdCodice></IdFiscaleIVA>` : ""}
        ${cfClienteXml}
        <Anagrafica>${anagrafica(snap, snap.ragione_sociale || (fornitoreEstero ? "Fornitore estero" : ""))}</Anagrafica>
        <RegimeFiscale>${escXml(fornitoreEstero ? "RF18" : (String(snap.regime_fiscale || "").match(/^RF\d{2}$/)?.[0] ?? "RF01"))}</RegimeFiscale>
      </DatiAnagrafici>
      ${sedeCliente}
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${escXml(azienda.partita_iva)}</IdCodice></IdFiscaleIVA>
        ${azienda.codice_fiscale ? `<CodiceFiscale>${escXml(String(azienda.codice_fiscale).toUpperCase())}</CodiceFiscale>` : ""}
        <Anagrafica><Denominazione>${x(azienda.ragione_sociale, 80)}</Denominazione></Anagrafica>
      </DatiAnagrafici>
      ${sedeAzienda}
    </CessionarioCommittente>
  </FatturaElettronicaHeader>`;
  } else {
    xml += `
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${escXml(azienda.partita_iva)}</IdCodice></IdFiscaleIVA>
        ${azienda.codice_fiscale ? `<CodiceFiscale>${escXml(String(azienda.codice_fiscale).toUpperCase())}</CodiceFiscale>` : ""}
        <Anagrafica><Denominazione>${x(azienda.ragione_sociale, 80)}</Denominazione></Anagrafica>
        <RegimeFiscale>${escXml(azienda.regime_fiscale)}</RegimeFiscale>
      </DatiAnagrafici>
      ${sedeAzienda}
      ${bloccoRea(azienda)}
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        ${idIvaCliente ? `<IdFiscaleIVA><IdPaese>${nazioneCliente}</IdPaese><IdCodice>${escXml(idIvaCliente)}</IdCodice></IdFiscaleIVA>` : ""}
        ${cfClienteXml}
        <Anagrafica>${anagrafica(snap)}</Anagrafica>
      </DatiAnagrafici>
      ${sedeCliente}
    </CessionarioCommittente>
  </FatturaElettronicaHeader>`;
  }

  // ─── Righe ────────────────────────────────────────────────────────────────

  // Ritenuta: se c'è DatiRitenuta, almeno una riga deve dire <Ritenuta>SI</Ritenuta>,
  // altrimenti lo SDI scarta (00411). Le righe segnate nell'editor valgono; se
  // nessuna lo è, la ritenuta è su tutto l'imponibile (come la calcola calcoli.ts).
  const conDatiRitenuta = !!((doc.ritenuta_acconto && doc.ritenuta_importo) || (doc.altra_ritenuta && doc.altra_ritenuta_importo));
  const righeSegnate = righe.some((r) => r.ritenuta === true);
  const ritenutaSu = (r: Dati | null) => conDatiRitenuta && (righeSegnate ? !!r?.ritenuta : true);

  const lineaXml = (n: number, r: Dati, ritenuta: boolean): string => {
    const quantita = Number(r.quantita) || 0;
    const segno = quantita < 0 ? -1 : 1;
    const q = Math.abs(quantita) || 1;
    const sc = scontoRiga(r);
    const aliquota = parseFloat(r.aliquota_iva) || 0;
    // Lo sconto in euro va scritto per unità: lo SDI ricalcola PrezzoTotale come
    // quantità × (prezzo − sconto). Senza, «Porta blindata 1.500 − 100» usciva
    // con PrezzoTotale 1.400 e prezzo 1.500: scarto 00423.
    const scontoXml = sc.percentuale
      ? `<ScontoMaggiorazione><Tipo>SC</Tipo><Percentuale>${fmtNum(sc.percentuale)}</Percentuale></ScontoMaggiorazione>`
      : sc.importo
        ? `<ScontoMaggiorazione><Tipo>SC</Tipo><Importo>${fmtNum8(sc.importo / q)}</Importo></ScontoMaggiorazione>`
        : "";
    return `      <DettaglioLinee>
        <NumeroLinea>${n}</NumeroLinea>
        ${r.codice_articolo ? `<CodiceArticolo><CodiceTipo>INTERNO</CodiceTipo><CodiceValore>${x(r.codice_articolo, 35)}</CodiceValore></CodiceArticolo>` : ""}
        <Descrizione>${x(r.descrizione, 1000) || "-"}</Descrizione>
        <Quantita>${fmtNum8(q)}</Quantita>
        ${r.unita_misura ? `<UnitaMisura>${x(r.unita_misura, 10)}</UnitaMisura>` : ""}
        <PrezzoUnitario>${fmtNum8(segno * (Number(r.prezzo_unitario) || 0))}</PrezzoUnitario>
        ${scontoXml}
        <PrezzoTotale>${fmtNum(r.imponibile)}</PrezzoTotale>
        <AliquotaIVA>${fmtNum(aliquota)}</AliquotaIVA>
        ${ritenuta ? "<Ritenuta>SI</Ritenuta>" : ""}
        ${r.natura_iva ? `<Natura>${escXml(naturaToXml(r.natura_iva))}</Natura>` : ""}
        ${r.riferimento_amministrazione ? `<RiferimentoAmministrazione>${x(r.riferimento_amministrazione, 20)}</RiferimentoAmministrazione>` : ""}
      </DettaglioLinee>`;
  };

  const lineeXml: string[] = righe.map((r, i) => lineaXml(i + 1, r, ritenutaSu(r)));

  // Sconto sul totale: calcoli.ts lo spalma sul riepilogo IVA, ma le righe
  // restavano a prezzo pieno e lo SDI, che confronta l'imponibile del riepilogo
  // con la somma delle righe, scartava (00422). Ora lo sconto è una riga in meno
  // per ogni aliquota, lunga esattamente la differenza.
  if ((Number(doc.sconto_globale_valore) || 0) > 0) {
    const cassaIn = (r: Dati) => {
      const al = parseFloat(r.aliquota) || 0;
      const cassaAl = parseFloat(doc.cassa_aliquota_iva ?? "22") || 0;
      return !r.natura && doc.cassa_previdenziale && al === cassaAl ? (Number(doc.cassa_importo) || 0) : 0;
    };
    for (const r of riepilogo) {
      const stessa = (l: Dati) => (parseFloat(l.aliquota_iva) || 0) === (parseFloat(r.aliquota) || 0) && (l.natura_iva ?? "") === (r.natura ?? "");
      const somma = righe.filter(stessa).reduce((s, l) => s + (Number(l.imponibile) || 0), 0);
      const differenza = Math.round((Number(r.imponibile) - somma - cassaIn(r)) * 100) / 100;
      if (differenza < 0) {
        lineeXml.push(lineaXml(lineeXml.length + 1, {
          descrizione: "Sconto sul totale del documento",
          quantita: 1,
          prezzo_unitario: differenza,
          imponibile: differenza,
          aliquota_iva: r.aliquota,
          natura_iva: r.natura,
        }, conDatiRitenuta && !righeSegnate));
      }
    }
  }

  // ─── Dati generali ────────────────────────────────────────────────────────

  const causali: string[] = [];
  const scritte = ((doc.causale ?? []) as unknown[]).map((c) => String(c ?? "")).filter((c) => c.trim());
  if (azienda.regime_fiscale === "RF19" && !scritte.some((c) => /190\/2014|forfettari/i.test(c))) {
    causali.push("Operazione effettuata ai sensi dell'art. 1, commi da 54 a 89, della legge 23 dicembre 2014, n. 190 - Regime forfettario");
  }
  for (const c of scritte) causali.push(c);
  const causaliXml = causali.flatMap((c) => aPezzi(c, 200)).map((c) => `<Causale>${escXml(c)}</Causale>`).join("\n        ");

  const ordini = ((doc.riferimenti_ordine ?? []) as Dati[]).filter((o) => o && (o.IdDocumento || o.id_documento || o.numero));
  const cigCup = `${doc.cig ? `<CodiceCIG>${x(doc.cig, 15)}</CodiceCIG>` : ""}${doc.cup ? `<CodiceCUP>${x(doc.cup, 15)}</CodiceCUP>` : ""}`;
  const ordiniXml = ordini.length
    ? ordini.map((o) => {
      const data = fmtDate(String(o.Data ?? o.data ?? ""));
      return `<DatiOrdineAcquisto><IdDocumento>${x(o.IdDocumento ?? o.id_documento ?? o.numero, 20)}</IdDocumento>${/^\d{4}-\d{2}-\d{2}$/.test(data) ? `<Data>${data}</Data>` : ""}${cigCup}</DatiOrdineAcquisto>`;
    }).join("\n      ")
    : (doc.cig || doc.cup) ? `<DatiOrdineAcquisto><IdDocumento>0</IdDocumento>${cigCup}</DatiOrdineAcquisto>` : "";

  // Nota di credito o di debito: la fattura che rettifica (art. 26 DPR 633/72).
  const collegata: Dati | null = (tipoDoc === "TD04" || tipoDoc === "TD05") && doc.fattura_collegata?.numero ? doc.fattura_collegata : null;
  const dataCollegata = collegata ? fmtDate(String(collegata.data ?? "")) : "";
  const collegataXml = collegata
    ? `<DatiFattureCollegate><IdDocumento>${x(collegata.numero, 20)}</IdDocumento>${/^\d{4}-\d{2}-\d{2}$/.test(dataCollegata) ? `<Data>${dataCollegata}</Data>` : ""}</DatiFattureCollegate>`
    : "";

  // Fattura differita: numero e data di ogni DDT (art. 21 c.4 DPR 633/72).
  // Stessi nomi dell'editor (NumeroDDT / DataDDT).
  const ddtXml = ((doc.riferimenti_ddt ?? []) as Dati[])
    .map((d) => ({ numero: d?.NumeroDDT ?? d?.numero, data: fmtDate(String(d?.DataDDT ?? d?.data ?? "")) }))
    .filter((d) => d.numero && /^\d{4}-\d{2}-\d{2}$/.test(d.data))
    .map((d) => `<DatiDDT><NumeroDDT>${x(d.numero, 20)}</NumeroDDT><DataDDT>${d.data}</DataDDT></DatiDDT>`)
    .join("\n      ");

  // Fattura accompagnatoria: dati del trasporto, solo quelli nel formato giusto.
  const vettore = (doc.ddt_vettore ?? null) as Dati | null;
  const colli = Number(doc.ddt_numero_colli);
  const peso = String(doc.ddt_peso ?? "").replace(",", ".").trim();
  const consegna = String(doc.ddt_data_ora_consegna ?? "").trim();
  const trasportoParti = [
    vettore?.partita_iva ? `<DatiAnagraficiVettore><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${escXml(idCodiceIva(vettore.partita_iva, "IT"))}</IdCodice></IdFiscaleIVA><Anagrafica><Denominazione>${x(vettore.denominazione || vettore.partita_iva, 80)}</Denominazione></Anagrafica></DatiAnagrafici></DatiAnagraficiVettore>` : "",
    doc.ddt_mezzo_trasporto ? `<MezzoTrasporto>${x(doc.ddt_mezzo_trasporto, 80)}</MezzoTrasporto>` : "",
    doc.ddt_causale_trasporto ? `<CausaleTrasporto>${x(doc.ddt_causale_trasporto, 100)}</CausaleTrasporto>` : "",
    Number.isInteger(colli) && colli > 0 && colli < 10000 ? `<NumeroColli>${colli}</NumeroColli>` : "",
    /^\d{1,4}(\.\d{1,2})?$/.test(peso) ? `<UnitaMisuraPeso>KG</UnitaMisuraPeso><PesoLordo>${Number(peso).toFixed(2)}</PesoLordo>` : "",
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(consegna) ? `<DataOraConsegna>${escXml(consegna.slice(0, 19))}</DataOraConsegna>` : "",
  ].filter(Boolean).join("");
  const trasportoXml = tipoDoc === "TD24" && trasportoParti ? `<DatiTrasporto>${trasportoParti}</DatiTrasporto>` : "";

  xml += `
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>${tipoDoc}</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>${fmtDate(doc.data_emissione)}</Data>
        <Numero>${x(doc.numero, 20)}</Numero>
        ${doc.ritenuta_acconto && doc.ritenuta_importo ? `<DatiRitenuta><TipoRitenuta>${escXml(doc.ritenuta_tipo || "RT01")}</TipoRitenuta><ImportoRitenuta>${fmtNum(doc.ritenuta_importo)}</ImportoRitenuta><AliquotaRitenuta>${fmtNum(doc.ritenuta_aliquota || 20)}</AliquotaRitenuta><CausalePagamento>${escXml(doc.ritenuta_causale || "A")}</CausalePagamento></DatiRitenuta>` : ""}
        ${doc.altra_ritenuta && doc.altra_ritenuta_importo ? `<DatiRitenuta><TipoRitenuta>${escXml(doc.altra_ritenuta_tipo || "RT03")}</TipoRitenuta><ImportoRitenuta>${fmtNum(doc.altra_ritenuta_importo)}</ImportoRitenuta><AliquotaRitenuta>${fmtNum(doc.altra_ritenuta_aliquota || 0)}</AliquotaRitenuta><CausalePagamento>${escXml(doc.altra_ritenuta_causale || "A")}</CausalePagamento></DatiRitenuta>` : ""}
        ${doc.bollo_virtuale ? `<DatiBollo><BolloVirtuale>SI</BolloVirtuale><ImportoBollo>${fmtNum(doc.bollo_importo || 2)}</ImportoBollo></DatiBollo>` : ""}
        ${doc.cassa_previdenziale && doc.cassa_importo ? `<DatiCassaPrevidenziale><TipoCassa>${escXml(doc.cassa_tipo || "TC22")}</TipoCassa><AlCassa>${fmtNum(doc.cassa_aliquota || 4)}</AlCassa><ImportoContributoCassa>${fmtNum(doc.cassa_importo)}</ImportoContributoCassa><ImponibileCassa>${fmtNum(doc.cassa_imponibile || doc.imponibile_totale)}</ImponibileCassa><AliquotaIVA>${fmtNum(parseFloat(doc.cassa_aliquota_iva || "22"))}</AliquotaIVA>${doc.cassa_ritenuta ? "<Ritenuta>SI</Ritenuta>" : ""}</DatiCassaPrevidenziale>` : ""}
        ${doc.rivalsa_inps && doc.rivalsa_importo ? `<DatiCassaPrevidenziale><TipoCassa>${escXml(doc.rivalsa_tipo || "TC22")}</TipoCassa><AlCassa>${fmtNum(doc.rivalsa_aliquota || 4)}</AlCassa><ImportoContributoCassa>${fmtNum(doc.rivalsa_importo)}</ImportoContributoCassa><ImponibileCassa>${fmtNum(doc.imponibile_totale)}</ImponibileCassa><AliquotaIVA>${fmtNum(22)}</AliquotaIVA></DatiCassaPrevidenziale>` : ""}
        <ImportoTotaleDocumento>${fmtNum(doc.totale_documento)}</ImportoTotaleDocumento>
        ${Number(doc.arrotondamento) ? `<Arrotondamento>${fmtNum(doc.arrotondamento)}</Arrotondamento>` : ""}
        ${causaliXml}
      </DatiGeneraliDocumento>
      ${ordiniXml}
      ${collegataXml}
      ${ddtXml}
      ${trasportoXml}
    </DatiGenerali>
    <DatiBeniServizi>
${lineeXml.join("\n")}
${riepilogo.map((r: Dati) => {
    const natura = r.natura ? naturaToXml(r.natura) : "";
    const riferimento = natura ? (r.riferimento_normativo || RIFERIMENTO_NORMATIVO[natura] || "") : (r.riferimento_normativo || "");
    return `      <DatiRiepilogo>
        <AliquotaIVA>${fmtNum(parseFloat(r.aliquota) || 0)}</AliquotaIVA>
        ${natura ? `<Natura>${escXml(natura)}</Natura>` : ""}
        <ImponibileImporto>${fmtNum(r.imponibile)}</ImponibileImporto>
        <Imposta>${fmtNum(r.imposta)}</Imposta>
        <EsigibilitaIVA>${r.esigibilita || "I"}</EsigibilitaIVA>
        ${riferimento ? `<RiferimentoNormativo>${x(riferimento, 100)}</RiferimentoNormativo>` : ""}
      </DatiRiepilogo>`;
  }).join("\n")}
    </DatiBeniServizi>`;

  // ─── Pagamento ────────────────────────────────────────────────────────────
  // TP01 = pagamento a rate, TP02 = pagamento completo: erano invertiti.
  if (scadenze.length > 0 || doc.metodo_pagamento_codice) {
    const modalita = (m: unknown) => (MODALITA_PAGAMENTO.test(String(m ?? "")) ? String(m) : "MP05");
    const ibanXml = (v: unknown) => {
      const iban = String(v ?? "").replace(/\s/g, "").toUpperCase();
      return IBAN.test(iban) ? `<IBAN>${iban}</IBAN>` : "";
    };
    const istitutoXml = (v: unknown) => (v ? `<IstitutoFinanziario>${x(v, 80)}</IstitutoFinanziario>` : "");
    const dettagli = scadenze.length > 0
      ? scadenze.map((sc: Dati) => `<DettaglioPagamento>
        <ModalitaPagamento>${modalita(sc.metodo_pagamento || doc.metodo_pagamento_codice)}</ModalitaPagamento>
        ${sc.data_scadenza ? `<DataScadenzaPagamento>${fmtDate(sc.data_scadenza)}</DataScadenzaPagamento>` : ""}
        <ImportoPagamento>${fmtNum(sc.importo)}</ImportoPagamento>
        ${istitutoXml(sc.istituto_finanziario || doc.nome_banca)}
        ${ibanXml(sc.iban || doc.iban_pagamento)}
      </DettaglioPagamento>`).join("\n      ")
      : `<DettaglioPagamento>
        <ModalitaPagamento>${modalita(doc.metodo_pagamento_codice)}</ModalitaPagamento>
        <ImportoPagamento>${fmtNum(doc.totale_da_pagare)}</ImportoPagamento>
        ${istitutoXml(doc.nome_banca)}
        ${ibanXml(doc.iban_pagamento)}
      </DettaglioPagamento>`;
    xml += `
    <DatiPagamento>
      <CondizioniPagamento>${scadenze.length > 1 ? "TP01" : "TP02"}</CondizioniPagamento>
      ${dettagli}
    </DatiPagamento>`;
  }

  // Allegati (per esempio il PDF di cortesia), se il documento ne porta.
  for (const a of ((doc.allegati ?? []) as Dati[])) {
    if (a?.nome && a?.contenuto) {
      xml += `
    <Allegati>
      <NomeAttachment>${x(a.nome, 60)}</NomeAttachment>
      <FormatoAttachment>${x(a.formato || "PDF", 10)}</FormatoAttachment>
      <Attachment>${escXml(String(a.contenuto))}</Attachment>
    </Allegati>`;
    }
  }

  xml += `
  </FatturaElettronicaBody>
</p:FatturaElettronica>`;

  return xml;
}
