/**
 * «Quanto lavora Silvio» (1/11/2026, fase 5, lotto 5.4): i numeri della scheda, dalla RPC
 * `silvio_quanto_lavora` (migrazione 20281106142000). Vedi docs/piano-silvio-commessa-ai.md,
 * sezione 4 («Misura»).
 *
 * Solo numeri veri: quello che non c'è vale zero e la scheda dice «ancora nessun dato». L'unica
 * stima è il tempo risparmiato, con la regola scritta accanto al numero: MINUTI_PER_VOCE per
 * ogni voce che Silvio ha scritto (una fase, una rata, un'attività, una colonna riempita), il
 * tempo di inserirla a mano.
 *
 * Senza dipendenze, compatibile con Deno.
 */

/** Il tempo di inserire a mano una voce della commessa (una fase, una rata, un campo). */
export const MINUTI_PER_VOCE = 2;

export interface QuantoLavora {
  dal: string;
  al: string;
  pagina: number;
  per_pagina: number;
  totale_righe: number;
  totali: { commesse_create: number; commesse_completate: number; punteggio_medio: number | null; voci_scritte: number };
  correzioni: { totale: number; tenute_cosi: number; cambiate: number; per_area: Record<string, number> };
  costo_ai_eur: number;
  /** Proposte del piano di volo per stato: aperta, confermata, scartata, scaduta. */
  piano_volo: Record<string, number>;
  commesse: {
    order_id: string; codice: string | null; titolo: string | null; modo: "crea" | "completa";
    eseguita_il: string; voci: number; punteggio: number | null; correzioni: number;
  }[];
}

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** La risposta della RPC ripulita: ogni numero che manca è zero, mai inventato. */
export function quantoLavoraDaRisposta(d: unknown): QuantoLavora {
  const r = (d && typeof d === "object" ? d : {}) as Record<string, unknown>;
  const t = (r.totali ?? {}) as Record<string, unknown>;
  const c = (r.correzioni ?? {}) as Record<string, unknown>;
  return {
    dal: String(r.dal ?? ""), al: String(r.al ?? ""),
    pagina: Math.max(1, n(r.pagina) || 1), per_pagina: Math.max(1, n(r.per_pagina) || 20), totale_righe: n(r.totale_righe),
    totali: {
      commesse_create: n(t.commesse_create), commesse_completate: n(t.commesse_completate),
      punteggio_medio: t.punteggio_medio == null ? null : n(t.punteggio_medio), voci_scritte: n(t.voci_scritte),
    },
    correzioni: {
      totale: n(c.totale), tenute_cosi: n(c.tenute_cosi), cambiate: n(c.cambiate),
      per_area: (c.per_area && typeof c.per_area === "object" ? c.per_area : {}) as Record<string, number>,
    },
    costo_ai_eur: n(r.costo_ai_eur),
    piano_volo: (r.piano_volo && typeof r.piano_volo === "object" ? r.piano_volo : {}) as Record<string, number>,
    commesse: Array.isArray(r.commesse) ? (r.commesse as QuantoLavora["commesse"]) : [],
  };
}

/** Il tempo risparmiato stimato, in minuti. */
export function minutiRisparmiati(voci: number): number {
  return Math.max(0, Math.round(voci)) * MINUTI_PER_VOCE;
}

/** «3 h 20 min», «45 min», «0 min». */
export function durataInParole(minuti: number): string {
  const m = Math.max(0, Math.round(minuti));
  const h = Math.floor(m / 60);
  const resto = m % 60;
  if (!h) return `${resto} min`;
  return resto ? `${h} h ${resto} min` : `${h} h`;
}

/** Quota delle proposte tenute così, in %; null senza correzioni (non è 100 %, è «nessun dato»). */
export function quotaTenuta(c: QuantoLavora["correzioni"]): number | null {
  return c.totale > 0 ? Math.round((c.tenute_cosi / c.totale) * 100) : null;
}

/** Non c'è ancora niente da contare nel periodo. */
export function senzaDati(q: QuantoLavora): boolean {
  return q.totali.commesse_create + q.totali.commesse_completate === 0 && q.correzioni.totale === 0
    && q.costo_ai_eur === 0 && Object.values(q.piano_volo).every((x) => !x);
}
