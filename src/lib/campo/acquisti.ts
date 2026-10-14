/**
 * Merce presa in negozio (04/10/2026): l'operaio fotografa bolla, scontrino o fattura,
 * il sistema legge i prodotti, lui dice COME l'ha presa e l'ufficio verifica.
 *
 * Qui: i tipi, la lettura del documento (la stessa lettura delle bolle dell'ufficio, ddt-ai-extract,
 * ricondotta a un modulo semplice da controllare), il totale e le frasi sullo stato.
 */
export type ModalitaAcquisto = "pagato_da_me" | "conto_azienda" | "ritiro_ordine";
export type StatoAcquisto = "da_verificare" | "registrato" | "rifiutato" | "annullato";
export type StatoRimborso = "non_dovuto" | "da_rimborsare" | "rimborsato";

export interface RigaAcquisto {
  descrizione: string;
  codice?: string | null;
  quantita: number;
  unita?: string | null;
  prezzo_unitario?: number | null;
  importo?: number | null;
}

export interface LetturaDocumento {
  fornitore: string;
  numero: string;
  /** YYYY-MM-DD, oppure vuota se non letta. */
  data: string;
  totale: number | null;
  righe: RigaAcquisto[];
  /** 0–1: quanto la lettura è sicura di sé. */
  confidenza: number;
  /** La lettura è incerta o incompleta: all'operaio si dice «controlla», non il testo grezzo dell'AI. */
  daControllare: boolean;
}

export const MODALITA: ReadonlyArray<{ key: ModalitaAcquisto; titolo: string; descrizione: string }> = [
  { key: "pagato_da_me", titolo: "L’ho pagata io", descrizione: "Scontrino o ricevuta: l’azienda mi rimborsa." },
  { key: "conto_azienda", titolo: "Sul conto dell’azienda", descrizione: "Me l’hanno addebitata: arriva la fattura." },
  { key: "ritiro_ordine", titolo: "Ritiro di un ordine già fatto", descrizione: "L’ufficio l’aveva ordinata: ritiro e basta." },
];

export const tipoDocumentoDa = (m: ModalitaAcquisto) => (m === "pagato_da_me" ? "scontrino" : "bolla");

/** Numeri del documento e del modulo: decimali italiani, senza coercire booleani o testo. */
export const numeroDocumento = (v: unknown): number | null => {
  if (typeof v !== "number" && typeof v !== "string") return null;
  let t = typeof v === "string" ? v.trim().replace(/\s/g, "").replace(/(?:€|EUR)$/i, "") : String(v);
  if (!t) return null;
  if (t.includes(",")) {
    if (!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+),\d*$/.test(t)) return null;
    t = t.replace(/\./g, "").replace(",", ".");
  }
  if (!/^-?\d+(?:\.\d*)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const num = numeroDocumento;
const testo = (v: unknown, max = 200): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const dataIso = (v: unknown): string => {
  const t = testo(v, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return "";
  const date = new Date(`${t}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === t ? t : "";
};
const arrotonda = (n: number) => Math.round(n * 100) / 100;

export function totaleRighe(righe: readonly RigaAcquisto[]): number | null {
  const importi = righe.map(r => (r.importo != null ? r.importo : r.prezzo_unitario != null && r.quantita > 0 ? arrotonda(r.prezzo_unitario * r.quantita) : null));
  if (importi.length === 0 || importi.some(i => i == null || !Number.isFinite(i) || i < 0)) return null;
  return arrotonda(importi.reduce<number>((s, i) => s + (i ?? 0), 0));
}

/** Una quantità corretta non deve portarsi dietro l'importo della quantità precedente. */
export function cambiaQuantita(riga: RigaAcquisto, quantita: number): RigaAcquisto {
  const valida = Number.isFinite(quantita) && quantita > 0;
  return {
    ...riga, quantita,
    importo: !valida ? null : riga.prezzo_unitario != null && Number.isFinite(riga.prezzo_unitario) && riga.prezzo_unitario >= 0
      ? arrotonda(riga.prezzo_unitario * quantita)
      : quantita === riga.quantita ? riga.importo : null,
  };
}

/**
 * Dal risultato di ddt-ai-extract al modulo dell'operaio. Il fornitore è il mittente del documento
 * (per uno scontrino, il negozio). Quello che non si legge resta vuoto: non si inventa niente.
 */
export function mappaLetturaDocumento(ddt: unknown): LetturaDocumento {
  const d = (ddt && typeof ddt === "object" ? ddt : {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const righe: RigaAcquisto[] = (Array.isArray(d.righe_merce) ? d.righe_merce : [])
    .map((r: Record<string, unknown>): RigaAcquisto => ({
      descrizione: testo(r?.descrizione),
      codice: testo(r?.codice_articolo, 60) || null,
      // Zero indica «non letta»: l'operaio deve confermarla, non inventiamo un pezzo.
      quantita: (num(r?.quantita) ?? 0) > 0 ? num(r?.quantita)! : 0,
      unita: testo(r?.unita_misura, 12).toLowerCase() || null,
      prezzo_unitario: num(r?.prezzo_unitario_eur),
      importo: num(r?.importo_eur),
    }))
    .filter((r: RigaAcquisto) => r.descrizione !== "");
  const imponibile = num(d.totali?.imponibile_eur);
  const iva = num(d.totali?.iva_eur);
  const totale = num(d.totali?.totale_documento_eur)
    ?? (imponibile != null && iva != null ? arrotonda(imponibile + iva) : null)
    ?? totaleRighe(righe);
  const confidenza = Math.max(0, Math.min(1, num(d.confidence) ?? 0.5));
  const fornitore = testo(d.mittente?.ragione_sociale, 120);
  return {
    fornitore,
    numero: testo(d.intestazione?.numero_ddt, 60),
    data: dataIso(d.intestazione?.data_ddt),
    totale,
    righe,
    confidenza,
    daControllare: confidenza < 0.75 || righe.length === 0 || totale == null || totale < 0 || fornitore === ""
      || righe.some(r => r.quantita <= 0 || r.quantita > 1000000 || (r.importo != null && r.importo < 0))
      || dataIso(d.intestazione?.data_ddt) === "",
  };
}

export const euro = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });

/** Il testo dello stato come lo legge l'operaio, senza gergo. */
export function descriviStato(a: { stato: StatoAcquisto; rimborso_stato: StatoRimborso; modalita: ModalitaAcquisto; motivo_rifiuto?: string | null }): { testo: string; tono: "attesa" | "ok" | "no" | "neutro" } {
  if (a.stato === "da_verificare") return { testo: "In verifica dall’ufficio", tono: "attesa" };
  if (a.stato === "rifiutato") return { testo: a.motivo_rifiuto?.trim() ? `Non accettata: ${a.motivo_rifiuto.trim()}` : "Non accettata", tono: "no" };
  if (a.stato === "annullato") return { testo: "Ritirata", tono: "neutro" };
  if (a.rimborso_stato === "da_rimborsare") return { testo: "Registrata · rimborso in programma", tono: "ok" };
  if (a.rimborso_stato === "rimborsato") return { testo: "Registrata · rimborsata", tono: "ok" };
  return { testo: "Registrata dall’ufficio", tono: "ok" };
}
