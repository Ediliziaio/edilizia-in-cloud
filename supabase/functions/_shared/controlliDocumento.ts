/**
 * Controlli deterministici su ciò che l'AI ha letto da un documento (30/10/2026).
 *
 * Vivevano dentro ai-document-analyzer, senza test, e cercavano per le fatture
 * campi che il parser non scrive: `piva_cedente`, `imponibile`, `iva`, `totale`
 * invece di `cedente.piva`, `imponibile_totale`, `iva_totale`, `totale_documento`.
 * Risultato: ogni fattura letta bene prendeva due avvisi falsi («P.IVA cedente
 * mancante», «Totale non rilevato») e i controlli veri (cifra di controllo della
 * P.IVA, totali che quadrano) non giravano mai. Ora il modulo è puro, legge i
 * nomi dei parser veri (e quelli vecchi) ed è usato anche dalle funzioni che
 * rispondono direttamente all'app (fattura, DDT).
 *
 * Non corregge nulla: dice cosa non torna, con la gravità, e quali campi
 * l'utente deve guardare (`daVerificare`).
 */

export type Gravita = "info" | "warn" | "error";

export interface AvvisoDocumento {
  code: string;
  field?: string;
  message: string;
  severity: Gravita;
}

export interface EsitoControlli {
  warnings: AvvisoDocumento[];
  /** 0..1: 1 meno 0,25 per errore e 0,10 per avviso. */
  score: number;
  /** Campi implicati in un avviso o in un errore, senza doppioni. */
  daVerificare: string[];
}

type Dati = Record<string, unknown>;

const TOL_FATTURA = 0.05;
const TOL_COMPUTO = 1.0;

const oggetto = (v: unknown): Dati | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Dati) : null;

const elenco = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Primo valore presente tra più percorsi con il punto («cedente.piva»): vuoti e null contano come assenti. */
function leggi(d: Dati, ...percorsi: string[]): unknown {
  for (const percorso of percorsi) {
    let corrente: unknown = d;
    for (const chiave of percorso.split(".")) {
      const o = oggetto(corrente);
      if (!o) {
        corrente = undefined;
        break;
      }
      corrente = o[chiave];
    }
    if (corrente !== undefined && corrente !== null && corrente !== "") return corrente;
  }
  return undefined;
}

/** Numero da un number o da una stringa italiana («€ 1.234,56», «12,5»); null se non è un numero. */
export function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[€\s]/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

const vicini = (a: number, b: number, tolleranza: number) => Math.abs(a - b) <= tolleranza;
const euro = (n: number) => n.toFixed(2);

export type EsitoPiva = "ok" | "mancante" | "non_valida" | "estera";

/**
 * Partita IVA italiana: 11 cifre, l'ultima di controllo. Un numero con il prefisso
 * di un altro paese («DE123456789») non ha quella cifra: si dice «estera» e non si
 * giudica, invece di darlo per sbagliato.
 */
export function verificaPiva(piva: unknown): EsitoPiva {
  const pulita = String(piva ?? "").replace(/[\s.\-]/g, "").toUpperCase();
  if (!pulita) return "mancante";
  const prefisso = /^([A-Z]{2})(.+)$/.exec(pulita);
  if (prefisso && prefisso[1] !== "IT") return "estera";
  const cifre = prefisso ? prefisso[2] : pulita;
  if (!/^\d{11}$/.test(cifre)) return "non_valida";
  let somma = 0;
  for (let i = 0; i < 11; i++) {
    const d = parseInt(cifre[i], 10);
    if (i % 2 === 0) somma += d;
    else somma += d * 2 > 9 ? d * 2 - 9 : d * 2;
  }
  return somma % 10 === 0 ? "ok" : "non_valida";
}

export function isValidPiva(piva: string | null | undefined): boolean {
  return verificaPiva(piva) === "ok";
}

/** YYYY-MM-DD che esiste davvero nel calendario; altrimenti null. */
function dataIso(v: unknown): Date | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : d;
}

const GIORNO_MS = 24 * 60 * 60 * 1000;

class Raccolta {
  readonly warnings: AvvisoDocumento[] = [];
  aggiungi(code: string, field: string | undefined, message: string, severity: Gravita) {
    this.warnings.push(field ? { code, field, message, severity } : { code, message, severity });
  }
}

/**
 * La data del documento deve esistere, non stare nel futuro e non essere vecchissima.
 * Una scadenza sta per natura nel futuro (e può essere vecchia se lo è la fattura):
 * di quella si controlla solo che esista (`soloEsistenza`).
 */
function controllaData(r: Raccolta, campo: string, valore: unknown, nome: string, oggi: Date, soloEsistenza = false) {
  if (valore === undefined) return;
  const d = dataIso(valore);
  if (!d) {
    r.aggiungi("data_non_valida", campo, `${nome} non valida: ${String(valore)}`, "warn");
  } else if (soloEsistenza) {
    return;
  } else if (d.getTime() > oggi.getTime() + GIORNO_MS) {
    r.aggiungi("data_futura", campo, `${nome} nel futuro: ${String(valore)}`, "warn");
  } else if (d.getTime() < oggi.getTime() - 3653 * GIORNO_MS) {
    r.aggiungi("data_molto_vecchia", campo, `${nome} di oltre dieci anni fa: ${String(valore)}`, "warn");
  }
}

function controllaFattura(f: Dati, tipo: string, r: Raccolta, oggi: Date) {
  const eRicevuta = tipo === "ricevuta";
  const pivaCedente = leggi(f, "piva_cedente", "cedente.piva", "cedente.partita_iva", "vat_seller", "partita_iva_emittente", "fornitore.piva", "fornitore.partita_iva");
  const pivaCessionario = leggi(f, "piva_cessionario", "cessionario.piva", "cessionario.partita_iva", "vat_buyer", "partita_iva_destinatario", "destinatario.piva");
  const imponibile = num(leggi(f, "imponibile_totale", "imponibile", "taxable", "totali.imponibile"));
  const iva = num(leggi(f, "iva_totale", "iva", "vat_amount", "totali.iva"));
  const totale = num(leggi(f, "totale_documento", "totale", "total", "totali.totale"));

  if (!eRicevuta) {
    if (leggi(f, "numero_fattura", "numero", "invoice_number") === undefined) {
      r.aggiungi("missing_numero_fattura", "numero_fattura", "Numero fattura non rilevato", "warn");
    }
    const esito = verificaPiva(pivaCedente);
    if (esito === "mancante") {
      r.aggiungi("missing_piva_cedente", "piva_cedente", "P.IVA cedente mancante", "warn");
    } else if (esito === "non_valida") {
      r.aggiungi("invalid_piva_cedente", "piva_cedente", `P.IVA cedente non valida: ${String(pivaCedente)}`, "error");
    } else if (esito === "estera") {
      r.aggiungi("foreign_piva_cedente", "piva_cedente", `P.IVA cedente estera, non verificata: ${String(pivaCedente)}`, "info");
    }
    if (pivaCessionario !== undefined && verificaPiva(pivaCessionario) === "non_valida") {
      r.aggiungi("invalid_piva_cessionario", "piva_cessionario", `P.IVA cessionario non valida: ${String(pivaCessionario)}`, "error");
    }
  }

  // Totale = imponibile + IVA
  if (imponibile !== null && iva !== null && totale !== null) {
    if (!vicini(imponibile + iva, totale, TOL_FATTURA)) {
      r.aggiungi(
        "totale_imponibile_iva_mismatch",
        "totale",
        `Totale ${euro(totale)} ≠ imponibile (${euro(imponibile)}) + IVA (${euro(iva)}) = ${euro(imponibile + iva)}`,
        "error",
      );
    }
  } else if (totale === null) {
    r.aggiungi("missing_totale", "totale", "Totale non rilevato", "warn");
  }

  // Riepilogo per aliquota: le righe sommano ai totali e ogni imposta è imponibile × aliquota
  let sommaImponibili = 0;
  let sommaImposte = 0;
  let righeRiepilogo = 0;
  for (const voce of elenco(f.riepilogo_iva)) {
    const v = oggetto(voce);
    if (!v) continue;
    const aliquota = num(v.aliquota);
    const imponibileRiga = num(v.imponibile);
    const imposta = num(v.imposta ?? v.iva);
    if (imponibileRiga === null || imposta === null) continue;
    righeRiepilogo++;
    sommaImponibili += imponibileRiga;
    sommaImposte += imposta;
    if (aliquota !== null && !vicini((imponibileRiga * aliquota) / 100, imposta, TOL_FATTURA)) {
      r.aggiungi(
        "riepilogo_aliquota_mismatch",
        "riepilogo_iva",
        `Imposta ${euro(imposta)} ≠ ${euro(imponibileRiga)} × ${aliquota}% = ${euro((imponibileRiga * aliquota) / 100)}`,
        "warn",
      );
    }
  }
  if (righeRiepilogo > 0) {
    if (imponibile !== null && !vicini(sommaImponibili, imponibile, TOL_FATTURA)) {
      r.aggiungi("riepilogo_imponibile_mismatch", "riepilogo_iva", `Imponibili del riepilogo ${euro(sommaImponibili)} ≠ imponibile ${euro(imponibile)}`, "warn");
    }
    if (iva !== null && !vicini(sommaImposte, iva, TOL_FATTURA)) {
      r.aggiungi("riepilogo_iva_mismatch", "riepilogo_iva", `Imposte del riepilogo ${euro(sommaImposte)} ≠ IVA ${euro(iva)}`, "warn");
    }
  }

  // Somma delle righe = imponibile (può differire per sconti, bollo, rivalse: solo un avviso)
  const righe = elenco(leggi(f, "righe", "lines"));
  if (righe.length > 0 && imponibile !== null) {
    let somma = 0;
    let contate = 0;
    for (const riga of righe) {
      const importo = num(leggi(oggetto(riga) ?? {}, "totale_riga", "importo", "total", "amount", "importo_eur"));
      if (importo !== null) {
        somma += importo;
        contate++;
      }
    }
    if (contate > 0 && !vicini(somma, imponibile, TOL_FATTURA)) {
      r.aggiungi("righe_imponibile_mismatch", "righe", `Somma righe ${euro(somma)} ≠ imponibile ${euro(imponibile)}`, "warn");
    }
  }

  // Date
  const data = leggi(f, "data_fattura", "data", "invoice_date");
  controllaData(r, "data_fattura", data, "Data fattura", oggi);
  const scadenza = leggi(f, "data_scadenza", "scadenza");
  controllaData(r, "data_scadenza", scadenza, "Data di scadenza", oggi, true);
  const d1 = dataIso(data);
  const d2 = dataIso(scadenza);
  if (d1 && d2 && d2.getTime() < d1.getTime()) {
    r.aggiungi("scadenza_prima_della_data", "data_scadenza", `Scadenza (${String(scadenza)}) prima della data della fattura (${String(data)})`, "warn");
  }
}

function controllaDdt(f: Dati, r: Raccolta, oggi: Date) {
  const nome = (v: unknown): string => {
    const o = oggetto(v);
    return (typeof v === "string" ? v : typeof o?.ragione_sociale === "string" ? o.ragione_sociale : "").trim();
  };
  const mittente = nome(leggi(f, "mittente", "sender"));
  const destinatario = nome(leggi(f, "destinatario", "recipient"));
  if (!mittente) r.aggiungi("missing_mittente", "mittente", "Mittente non rilevato", "warn");
  if (!destinatario) r.aggiungi("missing_destinatario", "destinatario", "Destinatario non rilevato", "warn");
  if (mittente && destinatario && mittente.toLowerCase() === destinatario.toLowerCase()) {
    r.aggiungi("mittente_uguale_destinatario", "destinatario", "Mittente e destinatario sono lo stesso nome: controlla i due riquadri", "warn");
  }
  if (leggi(f, "intestazione.numero_ddt", "numero_ddt", "numero") === undefined) {
    r.aggiungi("missing_numero_ddt", "numero_ddt", "Numero DDT non rilevato", "warn");
  }
  controllaData(r, "data_ddt", leggi(f, "intestazione.data_ddt", "data_ddt", "data"), "Data DDT", oggi);

  for (const chiave of ["mittente", "destinatario"] as const) {
    const piva = leggi(f, `${chiave}.partita_iva`, `${chiave}.piva`);
    if (piva !== undefined && verificaPiva(piva) === "non_valida") {
      r.aggiungi(`invalid_piva_${chiave}`, chiave, `P.IVA ${chiave} non valida: ${String(piva)}`, "warn");
    }
  }

  const righe = elenco(leggi(f, "righe_merce", "righe", "items"));
  if (righe.length === 0) {
    r.aggiungi("no_righe", "righe_merce", "Nessuna riga merce estratta", "warn");
  } else {
    const senzaQuantita = righe.filter((riga) => {
      const q = num(oggetto(riga)?.quantita);
      return q === null || q <= 0;
    }).length;
    if (senzaQuantita > 0) {
      r.aggiungi("righe_senza_quantita", "righe_merce", `${senzaQuantita} righe con quantità mancante o non positiva`, "warn");
    }
  }

  const imponibile = num(leggi(f, "totali.imponibile_eur", "totali.imponibile"));
  const iva = num(leggi(f, "totali.iva_eur", "totali.iva"));
  const totale = num(leggi(f, "totali.totale_documento_eur", "totali.totale"));
  if (imponibile !== null && iva !== null && totale !== null && !vicini(imponibile + iva, totale, TOL_FATTURA)) {
    r.aggiungi("totale_imponibile_iva_mismatch", "totali", `Totale ${euro(totale)} ≠ imponibile (${euro(imponibile)}) + IVA (${euro(iva)})`, "warn");
  }
}

function controllaComputo(f: Dati, r: Raccolta) {
  const totale = num(leggi(f, "totale", "total", "totale_lavori"));
  const righe = elenco(leggi(f, "righe", "voci", "lines"));
  if (righe.length > 0 && totale !== null) {
    let somma = 0;
    let contate = 0;
    for (const riga of righe) {
      const importo = num(leggi(oggetto(riga) ?? {}, "importo", "total", "totale"));
      if (importo !== null) {
        somma += importo;
        contate++;
      }
    }
    if (contate > 0 && !vicini(somma, totale, TOL_COMPUTO)) {
      r.aggiungi("righe_totale_mismatch", "righe", `Somma voci ${euro(somma)} ≠ totale lavori ${euro(totale)}`, "warn");
    }
  }
  if (righe.length === 0) r.aggiungi("no_righe", "righe", "Nessuna riga estratta", "warn");
}

const TIPI_FATTURA = new Set(["fattura", "fattura_attiva", "fattura_passiva", "ricevuta"]);
const TIPI_COMPUTO = new Set(["computo_metrico", "preventivo"]);
const TIPI_DDT = new Set(["ddt", "ddt_in", "ddt_out"]);

/**
 * `tipo` è il doc_type del router. `oggi` serve solo ai test.
 */
export function controllaDocumento(tipo: string, campi: Dati | null | undefined, oggi: Date = new Date()): EsitoControlli {
  const r = new Raccolta();
  const f = oggetto(campi);
  if (!f) {
    r.aggiungi("no_fields", undefined, "Nessun campo strutturato estratto", "warn");
    return { warnings: r.warnings, score: 0.4, daVerificare: [] };
  }
  if (TIPI_FATTURA.has(tipo)) controllaFattura(f, tipo, r, oggi);
  else if (TIPI_COMPUTO.has(tipo)) controllaComputo(f, r);
  else if (TIPI_DDT.has(tipo)) controllaDdt(f, r, oggi);
  return riassumi(r.warnings);
}

function riassumi(warnings: AvvisoDocumento[]): EsitoControlli {
  const errori = warnings.filter((w) => w.severity === "error").length;
  const avvisi = warnings.filter((w) => w.severity === "warn").length;
  const score = Math.max(0, Math.min(1, 1 - errori * 0.25 - avvisi * 0.1));
  const daVerificare = [...new Set(warnings.filter((w) => w.severity !== "info" && w.field).map((w) => w.field as string))];
  return { warnings, score, daVerificare };
}

/**
 * Stato di un'analisi: quello che si mostra all'utente e quello che si salva.
 * Se il passo che legge i dati è fallito, il risultato è parziale (solo il tipo di
 * documento): si mostra «da rivedere», ma si salva `failed`, perché ai-document-analyzer
 * riusa per impronta del file le analisi riuscite o da rivedere e quella monca,
 * rimandando lo stesso documento dopo la ricarica, non verrebbe mai rifatta.
 */
export function statoAnalisi(
  esito: { haErrori: boolean; score: number; passoFallito: boolean },
): { mostrato: "success" | "review_required"; salvato: "success" | "review_required" | "failed" } {
  const mostrato = esito.haErrori || esito.passoFallito || esito.score < 0.6 ? "review_required" : "success";
  return { mostrato, salvato: esito.passoFallito ? "failed" : mostrato };
}

/** Aggiunge avvisi trovati altrove (per esempio «fattura già registrata») e rifà punteggio e campi da guardare. */
export function conAvvisi(esito: EsitoControlli, extra: AvvisoDocumento[]): EsitoControlli {
  return extra.length ? riassumi([...esito.warnings, ...extra]) : esito;
}
