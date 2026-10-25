/**
 * finanziamentoLite — simulazione rata "da €X/mese" per i PDF dei moduli.
 *
 * v1 TEMPLATE-DRIVEN: l'azienda configura la promo UNA volta nel template del
 * modulo (attivo, numero rate, TAN) e ogni preventivo mostra la rata calcolata
 * sul proprio totale. Non è un'offerta vincolante: è la leva commerciale
 * ("89 €/mese" chiude più di "24.000 €") con footnote di rimando alla
 * finanziaria. Il flusso con tabella convenzioni reale resta quello dei
 * preventivi classici (calcolaFinanziamento + QuoteFinancingPanel).
 */

export interface FinanziamentoPromo {
  attivo: boolean;
  /** Numero rate mensili (es. 12/24/48/120). */
  rate: number;
  /** TAN % annuo (0 = tasso zero promozionale). */
  tan_pct: number;
}

export const FINANZIAMENTO_RATE_OPZIONI = [12, 24, 36, 48, 60, 84, 120] as const;

/**
 * Il numero di rate scelto sul preventivo (colonna `finanziamento_rate` dei progetti edili): un intero da 1 a
 * 360, altrimenti null = quello del modello. Difensivo: dal database può arrivare anche una stringa.
 */
export function rateDelPreventivo(valore: unknown): number | null {
  if (valore == null || valore === "") return null;
  const n = Number(valore);
  return Number.isInteger(n) && n >= 1 && n <= 360 ? n : null;
}

/**
 * La promo del modello col numero di rate scelto sul preventivo al posto di quello del modello (il TAN resta).
 * Senza promo attiva o senza una scelta valida ridà il valore com'era.
 */
export function promoConRateDelPreventivo(raw: unknown, rateScelte: unknown): unknown {
  const rate = rateDelPreventivo(rateScelte);
  if (rate == null || !parseFinanziamentoPromo(raw)) return raw;
  return { ...(raw as Record<string, unknown>), rate };
}

/**
 * La finanziaria scelta sul preventivo (colonne `finanziamento_*` dei progetti edili): il TAN della riga di tabella
 * scelta, la rata di quella riga e l'importo su cui è stata calcolata. Vuota = vale la promo del modello.
 */
export interface SceltaFinanziaria {
  tanPct: number | null;
  rata: number | null;
  importo: number | null;
}

/** Legge i campi del progetto: senza la finanziaria scelta ridà null. Difensivo: dal database i numeri possono essere stringhe. */
export function sceltaFinanziariaDelPreventivo(p: {
  finanziamento_tabella_id?: unknown; finanziamento_tan_pct?: unknown; finanziamento_rata?: unknown; finanziamento_importo?: unknown;
}): SceltaFinanziaria | null {
  if (!p.finanziamento_tabella_id) return null;
  const num = (v: unknown): number | null => {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  return { tanPct: num(p.finanziamento_tan_pct), rata: num(p.finanziamento_rata), importo: num(p.finanziamento_importo) };
}

/**
 * La promo del PDF: quella del modello col numero di rate del preventivo; se il preventivo ha scelto una
 * finanziaria il TAN è quello della sua tabella, e vale anche senza promo nel modello. Niente rate o niente TAN
 * (e nessuna promo): nessuna promo.
 */
export function promoDelPreventivo(raw: unknown, rateScelte: unknown, scelta?: SceltaFinanziaria | null): FinanziamentoPromo | null {
  const promo = parseFinanziamentoPromo(promoConRateDelPreventivo(raw, rateScelte));
  if (promo) return scelta?.tanPct != null ? { ...promo, tan_pct: scelta.tanPct } : promo;
  const rate = rateDelPreventivo(rateScelte);
  if (scelta && scelta.tanPct != null && rate != null) return { attivo: true, rate, tan_pct: scelta.tanPct };
  return null;
}

/**
 * La rata mensile del PDF. Con la finanziaria scelta e il totale uguale a quello su cui era stata calcolata vale la
 * rata esatta della tabella (spese comprese); se il totale è cambiato dopo, si ricalcola col TAN della tabella
 * sul totale di adesso, così la rata non resta quella di un prezzo vecchio.
 */
export function rataDelPreventivoPdf(totale: number, promo: FinanziamentoPromo, scelta?: SceltaFinanziaria | null): number {
  if (scelta?.rata != null && scelta.rata > 0 && scelta.importo != null && Math.abs(scelta.importo - totale) < 0.5) return scelta.rata;
  return calcolaRataMensile(totale, promo.rate, promo.tan_pct);
}

/** Le rate da offrire come scelta: quelle di sempre, più quella del modello e quella già scelta se non ci sono. */
export function opzioniRate(rateModello: number, rateScelte?: number | null): number[] {
  const tutte = new Set<number>(FINANZIAMENTO_RATE_OPZIONI);
  tutte.add(rateModello);
  if (rateScelte != null) tutte.add(rateScelte);
  return [...tutte].sort((a, b) => a - b);
}

/** Rata mensile (ammortamento francese); TAN 0 → divisione semplice. */
export function calcolaRataMensile(totale: number, rate: number, tanPct: number): number {
  const P = Math.max(0, Number(totale) || 0);
  const n = Math.max(1, Math.round(Number(rate) || 1));
  const i = Math.max(0, Number(tanPct) || 0) / 100 / 12;
  if (P === 0) return 0;
  if (i === 0) return P / n;
  return (P * i) / (1 - Math.pow(1 + i, -n));
}

/** Parse difensivo del jsonb dal template (colonna finanziamento_promo). */
export function parseFinanziamentoPromo(raw: unknown): FinanziamentoPromo | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.attivo !== true) return null;
  const rate = Number(r.rate);
  const tan = Number(r.tan_pct);
  if (!Number.isFinite(rate) || rate < 1) return null;
  return { attivo: true, rate: Math.round(rate), tan_pct: Number.isFinite(tan) && tan >= 0 ? tan : 0 };
}
