// ============================================================================
// La lettura di una bolla fatta dall'AI, tradotta in quello che serve all'app
// ----------------------------------------------------------------------------
// `ddt-ai-extract` restituisce uno schema ricco: intestazione, mittente con
// partita IVA, destinatario, vettore, trasporto, RIGHE MERCE con prezzo
// unitario, totali, confidenza e avvisi.
//
// Fino al 29/10/2026 la maschera lo chiamava con `legacy_format: true`, cioè
// chiedeva apposta il formato piatto, e delle righe restava solo la somma delle
// quantità in un campo. L'AI i prodotti li prendeva: li perdevamo noi.
//
// Qui si traduce la lettura grezza una volta sola, e il risultato lo usano sia
// la maschera (per riempire i campi) sia il salvataggio (per scrivere le
// righe). Niente va a schermo che non passi da qui.
//
// Regola dei numeri: NULL vuol dire «non si legge». Uno zero direbbe «nessun
// pezzo», che è un'altra cosa, e si porterebbe dietro un prezzo di zero euro.
// ============================================================================

import type { DDTRigaNuova } from "@/hooks/useDDTRicezione";

export interface LetturaDDT {
  numero: string | null;
  /** La data del documento, in ISO (YYYY-MM-DD). */
  data: string | null;
  fornitoreNome: string | null;
  fornitorePiva: string | null;
  fornitoreCodiceFiscale: string | null;
  destinatarioNome: string | null;
  luogoDestinazione: string | null;
  causale: string | null;
  corriere: string | null;
  /**
   * Chi ha portato la merce. L'AI lo dice in `vettore.tipo`: «mittente» è il
   * fornitore col suo mezzo, «destinatario» siamo noi (cioè un RITIRO: siamo
   * andati a prenderla), «terzi» un corriere. Fino al 29/10/2026 lo leggeva e
   * lo buttavamo via, e la scheda chiedeva comunque corriere e autista — campi
   * vuoti su 231 bolle su 232.
   */
  trasportoACuraDi: "fornitore" | "noi" | "terzi" | null;
  /** «franco» = trasporto compreso, «assegnato» = a nostro carico. */
  porto: "franco" | "assegnato" | null;
  targaMezzo: string | null;
  autistaNome: string | null;
  /** HH:MM, come sta sul documento. */
  oraInizioTrasporto: string | null;
  colli: number | null;
  pesoKg: number | null;
  note: string | null;
  /** L'imponibile del documento, quando la bolla è valorizzata. */
  imponibile: number | null;
  totaleDocumento: number | null;
  confidenza: number | null;
  avvisi: string[];
  righe: DDTRigaNuova[];
}

function testoONull(v: unknown): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const s = String(v).trim();
  if (!s) return null;
  const basso = s.toLowerCase();
  return basso === "null" || basso === "non leggibile" ? null : s;
}

function numeroONull(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string" || !v.trim()) return null;
  // «1.234,56» all'italiana; «1.5» col punto decimale, come chiede il prompt.
  const s = v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v;
  const n = Number(s.trim());
  return Number.isFinite(n) ? n : null;
}

/** La data in ISO, scartando quello che non è una data vera. */
function dataONull(v: unknown): string | null {
  const s = testoONull(v);
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  // en-CA dà YYYY-MM-DD senza passare da toISOString, che sposta di fuso.
  return d.toLocaleDateString("en-CA");
}

function oggetto(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Da «mittente|destinatario|terzi» del documento a chi ha portato la merce. */
function trasportoDa(vettore: Record<string, unknown>): "fornitore" | "noi" | "terzi" | null {
  const t = testoONull(vettore.tipo)?.toLowerCase();
  if (t === "mittente") return "fornitore";
  // «destinatario» sul documento vuol dire che il trasporto è a nostro carico:
  // la merce l'abbiamo ritirata noi.
  if (t === "destinatario") return "noi";
  if (t === "terzi") return "terzi";
  return null;
}

/** La targa sta in un campo dedicato o, come dice il prompt, in vettore.note. */
function targaDa(vettore: Record<string, unknown>, trasporto: Record<string, unknown>): string | null {
  return (
    testoONull(vettore.targa) ??
    testoONull(vettore.targa_mezzo) ??
    testoONull(trasporto.targa_mezzo) ??
    testoONull(vettore.note)
  );
}

/**
 * Traduce il JSON di `ddt-ai-extract` (campo `ddt`) in una lettura usabile.
 * Non butta via nessuna riga: una riga senza descrizione leggibile conserva il
 * suo testo grezzo, e il database la tiene con quello.
 */
export function leggiDDTdaAI(grezzo: unknown): LetturaDDT {
  const d = oggetto(grezzo);
  const intestazione = oggetto(d.intestazione);
  const mittente = oggetto(d.mittente);
  const destinatario = oggetto(d.destinatario);
  const luogo = oggetto(d.luogo_destinazione);
  const vettore = oggetto(d.vettore);
  const trasporto = oggetto(d.trasporto);
  const totali = oggetto(d.totali);
  const riferimenti = oggetto(d.riferimenti);
  const righeGrezze = Array.isArray(d.righe_merce) ? d.righe_merce : [];

  const righe: DDTRigaNuova[] = righeGrezze.map((grezza, i): DDTRigaNuova => {
    const r = oggetto(grezza);
    const descrizione = testoONull(r.descrizione) ?? "";
    return {
      posizione: i + 1,
      codice_articolo: testoONull(r.codice_articolo),
      descrizione,
      unita_misura: testoONull(r.unita_misura)?.toLowerCase() ?? null,
      quantita: numeroONull(r.quantita),
      prezzo_unitario: numeroONull(r.prezzo_unitario_eur),
      importo: numeroONull(r.importo_eur),
      iva_percentuale: numeroONull(r.iva_percentuale),
      // L'abbinamento alla riga di commessa è un passo dopo, e facoltativo.
      order_item_id: null,
      origine: "ai",
      ai_originale: r,
      // Serve al database quando la descrizione non si legge, e a chi controlla
      // per sapere che su quella riga c'era scritto qualcosa.
      testo_grezzo: descrizione || (typeof grezza === "string" ? grezza : JSON.stringify(grezza)),
      note: null,
    };
  });

  const avvisi = Array.isArray(d.warnings)
    ? d.warnings.map((a) => testoONull(a)).filter((a): a is string => !!a)
    : [];

  return {
    numero: testoONull(intestazione.numero_ddt),
    data: dataONull(intestazione.data_ddt),
    fornitoreNome: testoONull(mittente.ragione_sociale),
    fornitorePiva: testoONull(mittente.partita_iva),
    fornitoreCodiceFiscale: testoONull(mittente.codice_fiscale),
    destinatarioNome: testoONull(destinatario.ragione_sociale),
    luogoDestinazione:
      testoONull(luogo.indirizzo) ??
      testoONull(luogo.comune) ??
      testoONull(destinatario.indirizzo),
    causale: testoONull(intestazione.causale),
    corriere: testoONull(vettore.ragione_sociale),
    trasportoACuraDi: trasportoDa(vettore),
    porto: (() => {
      const v = testoONull(trasporto.porto)?.toLowerCase();
      return v === "franco" || v === "assegnato" ? v : null;
    })(),
    targaMezzo: targaDa(vettore, trasporto),
    autistaNome: testoONull(vettore.autista) ?? testoONull(trasporto.autista_nome),
    oraInizioTrasporto: testoONull(intestazione.ora_inizio_trasporto)?.slice(0, 5) ?? null,
    colli: numeroONull(trasporto.n_colli),
    pesoKg: numeroONull(trasporto.peso_lordo_kg) ?? numeroONull(trasporto.peso_netto_kg),
    note: testoONull(riferimenti.note_libere),
    imponibile: numeroONull(totali.imponibile_eur),
    totaleDocumento: numeroONull(totali.totale_documento_eur),
    confidenza: numeroONull(d.confidence),
    avvisi,
    righe,
  };
}

/** La somma delle quantità: è quella che la maschera propone come «ricevuta». */
export function quantitaTotale(righe: DDTRigaNuova[]): number {
  return righe.reduce((s, r) => s + (r.quantita ?? 0), 0);
}

/**
 * L'importo di una riga: quello scritto sul documento, o quantità × prezzo
 * quando il documento non lo dice. La stessa regola del trigger `ddt_riga_prepara`.
 */
export function importoRiga(r: Pick<DDTRigaNuova, "importo" | "quantita" | "prezzo_unitario">): number | null {
  if (r.importo != null) return r.importo;
  if (r.quantita == null || r.prezzo_unitario == null) return null;
  return Math.round(r.quantita * r.prezzo_unitario * 100) / 100;
}

/** Quanto vale la merce di questa bolla. NULL se nessuna riga è valorizzata. */
export function importoTotale(righe: DDTRigaNuova[]): number | null {
  const importi = righe.map(importoRiga).filter((v): v is number => v != null);
  if (importi.length === 0) return null;
  return Math.round(importi.reduce((s, v) => s + v, 0) * 100) / 100;
}
