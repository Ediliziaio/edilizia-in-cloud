/**
 * Lettura di una fattura RICEVUTA (passiva) per la tabella fatture_ricevute.
 *
 * Stava dentro ricevi-sdi. Dal 24/09/2026 la usano in due: ricevi-sdi (il
 * caricamento a mano e il webhook) e openapi-fatture-ricevute (l'importazione
 * automatica). Il parser XML lo passa chi chiama, come in fatturapaReader.ts:
 * deno_dom sul server, il DOM di jsdom nei test — così quello che gira e
 * quello che si prova sono la stessa funzione.
 *
 * Due correzioni rispetto alla versione che stava in ricevi-sdi:
 *   · l'imponibile si prende dai DatiRiepilogo, come l'imposta: è il numero
 *     che va nel registro IVA. La somma delle righe può differire di qualche
 *     centesimo per gli arrotondamenti (lo SDI tollera fino a un euro).
 *   · un file con più fatture (un «lotto») si legge per la PRIMA: prima si
 *     prendevano numero e data della prima e si sommavano righe e riepiloghi
 *     di tutte, e ne usciva una fattura che non esiste.
 */
import type { DocumentoXml, ElementoXml, LettoreXml } from "./fatturapaReader.ts";

export interface FatturaRicevutaLetta {
  cedente_piva: string;
  cedente_cf: string;
  cedente_ragione_sociale: string;
  cedente_paese: string;
  cedente_indirizzo: string;
  cedente_cap: string;
  cedente_comune: string;
  cedente_provincia: string;
  /** Chi riceve: serve al webhook per trovare l'azienda. */
  cessionario_piva: string;
  cessionario_cf: string;
  tipo_documento: string;
  numero_fattura: string;
  data_fattura: string;
  imponibile_totale: number;
  iva_totale: number;
  totale_documento: number;
  righe: Array<Record<string, unknown>>;
  riepilogo_iva: Array<Record<string, unknown>>;
  sdi_id_trasmissione: string;
  sdi_progressivo: string;
  /** Fatture nel file: più di una è un lotto, e qui c'è solo la prima. */
  fatture_nel_file: number;
}

type Nodo = ElementoXml | DocumentoXml;

function primo(el: Nodo | null | undefined, tag: string): ElementoXml | null {
  if (!el) return null;
  const trovati = el.getElementsByTagName(tag);
  return trovati.length > 0 ? trovati[0] : null;
}

function testo(el: Nodo | null | undefined, tag: string): string {
  return primo(el, tag)?.textContent?.trim() ?? "";
}

function numero(el: Nodo | null | undefined, tag: string): number {
  const v = testo(el, tag).replace(",", ".");
  const n = v ? parseFloat(v) : 0;
  return Number.isFinite(n) ? n : 0;
}

const due = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Legge la fattura. Ritorna null se il file non è una fattura elettronica
 * leggibile (manca l'intestazione, il corpo o il fornitore): mai un oggetto a
 * metà, che diventerebbe un costo sbagliato in contabilità.
 */
/**
 * Toglie i prefissi di namespace dai nomi degli elementi (`p:Numero`,
 * `ns3:Data` → `Numero`, `Data`). Nello schema FatturaPA i figli non hanno
 * prefisso e basta il nome, ma alcuni programmi di fatturazione lo scrivono su
 * ogni elemento: con `getElementsByTagName("Numero")` quei file risultavano
 * senza numero, data e fornitore. Gli attributi (xmlns:p, xsi:…) non si toccano.
 */
export function senzaPrefissi(xml: string): string {
  return xml.replace(/<(\/?)[A-Za-z_][\w.-]*:(?=[A-Za-z_])/g, "<$1");
}

/**
 * Perché un file non è una fattura leggibile, in una riga per il registro degli
 * errori (sdi_log): il messaggio generico non dice quale pezzo manca.
 */
export function motivoNonLeggibile(xml: string, parser: LettoreXml): string {
  const pulito = senzaPrefissi(xml);
  let doc: DocumentoXml | null;
  try {
    doc = parser.parseFromString(pulito, "text/xml");
  } catch (e) {
    return `XML non interpretabile (${e instanceof Error ? e.message : "errore"})`;
  }
  if (!doc) return "XML vuoto";
  if (doc.getElementsByTagName("parsererror").length > 0) return "XML malformato";
  const inizio = pulito.replace(/<\?xml[^>]*\?>/i, "").trim().slice(0, 80).replace(/\s+/g, " ");
  if (doc.getElementsByTagName("FatturaElettronicaHeader").length === 0) return `manca FatturaElettronicaHeader (il file inizia con: ${inizio})`;
  const corpi = doc.getElementsByTagName("FatturaElettronicaBody");
  if (corpi.length === 0) return "manca FatturaElettronicaBody";
  if (doc.getElementsByTagName("CedentePrestatore").length === 0) return "manca CedentePrestatore";
  const dgd = primo(corpi[0], "DatiGeneraliDocumento");
  if (!dgd) return "manca DatiGeneraliDocumento";
  if (!testo(dgd, "Numero")) return "manca il Numero della fattura";
  return `data non valida: «${testo(dgd, "Data")}»`;
}

export function leggiFatturaRicevuta(xml: string, parser: LettoreXml): FatturaRicevutaLetta | null {
  xml = senzaPrefissi(xml);
  let doc: DocumentoXml | null;
  try {
    doc = parser.parseFromString(xml, "text/xml");
  } catch {
    return null;
  }
  if (!doc || doc.getElementsByTagName("parsererror").length > 0) return null;

  const header = primo(doc, "FatturaElettronicaHeader");
  const corpi = doc.getElementsByTagName("FatturaElettronicaBody");
  const body = corpi.length > 0 ? corpi[0] : null;
  if (!header || !body) return null;

  const ced = primo(header, "CedentePrestatore");
  if (!ced) return null;
  const idCed = primo(ced, "IdFiscaleIVA");
  let ragioneSociale = testo(ced, "Denominazione");
  if (!ragioneSociale) ragioneSociale = [testo(ced, "Nome"), testo(ced, "Cognome")].filter(Boolean).join(" ");
  const sede = primo(ced, "Sede");

  const ces = primo(header, "CessionarioCommittente");
  const dgd = primo(body, "DatiGeneraliDocumento");
  // Numero e data sono la chiave della fattura (e la data è obbligatoria in
  // tabella): senza, non è una fattura da registrare.
  if (!testo(dgd, "Numero") || !/^\d{4}-\d{2}-\d{2}$/.test(testo(dgd, "Data"))) return null;

  // Righe e riepiloghi del PRIMO corpo soltanto.
  const righe: Array<Record<string, unknown>> = [];
  let sommaRighe = 0;
  Array.from(body.getElementsByTagName("DettaglioLinee")).forEach((r, i) => {
    const prezzoTotale = numero(r, "PrezzoTotale");
    sommaRighe += prezzoTotale;
    righe.push({
      numero_linea: i + 1,
      descrizione: testo(r, "Descrizione"),
      quantita: numero(r, "Quantita") || 1,
      prezzo_unitario: numero(r, "PrezzoUnitario"),
      imponibile: prezzoTotale,
      aliquota_iva: String(numero(r, "AliquotaIVA")),
      natura_iva: testo(r, "Natura") || null,
    });
  });

  const riepilogo: Array<Record<string, unknown>> = [];
  let imponibile = 0;
  let imposta = 0;
  for (const r of Array.from(body.getElementsByTagName("DatiRiepilogo"))) {
    const imp = numero(r, "ImponibileImporto");
    const iva = numero(r, "Imposta");
    imponibile += imp;
    imposta += iva;
    riepilogo.push({
      aliquota: String(numero(r, "AliquotaIVA")),
      natura: testo(r, "Natura") || null,
      imponibile: imp,
      imposta: iva,
    });
  }
  // Senza riepilogo (file malformato) resta la somma delle righe.
  const imponibileTotale = due(riepilogo.length > 0 ? imponibile : sommaRighe);
  const ivaTotale = due(imposta);

  return {
    cedente_piva: testo(idCed, "IdCodice"),
    cedente_cf: testo(ced, "CodiceFiscale"),
    cedente_ragione_sociale: ragioneSociale || "Fornitore sconosciuto",
    cedente_paese: testo(idCed, "IdPaese") || "IT",
    cedente_indirizzo: testo(sede, "Indirizzo"),
    cedente_cap: testo(sede, "CAP"),
    cedente_comune: testo(sede, "Comune"),
    cedente_provincia: testo(sede, "Provincia"),
    cessionario_piva: testo(primo(ces, "IdFiscaleIVA"), "IdCodice"),
    cessionario_cf: testo(ces, "CodiceFiscale"),
    tipo_documento: testo(dgd, "TipoDocumento") || "TD01",
    numero_fattura: testo(dgd, "Numero"),
    data_fattura: testo(dgd, "Data"),
    imponibile_totale: imponibileTotale,
    iva_totale: ivaTotale,
    totale_documento: numero(dgd, "ImportoTotaleDocumento") || due(imponibileTotale + ivaTotale),
    righe,
    riepilogo_iva: riepilogo,
    sdi_id_trasmissione: testo(doc, "IdentificativoSdI"),
    sdi_progressivo: testo(primo(header, "DatiTrasmissione"), "ProgressivoInvio"),
    fatture_nel_file: corpi.length,
  };
}
