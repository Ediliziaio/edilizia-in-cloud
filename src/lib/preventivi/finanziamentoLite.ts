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
