/**
 * «Margine commesse nel periodo» del cruscotto: la stessa fonte di scheda
 * commessa e Marginalità cantieri, la vista `v_ordine_marginalita`.
 * Margine % = somma dei margini / somma dei preventivi totali (contratto più
 * variazioni approvate), sulle commesse del periodo. Modulo puro.
 */
export interface RigaMargineCommessa {
  margine: number | string | null;
  preventivo_totale: number | string | null;
}

const numero = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function margineCommesseNelPeriodo(righe: ReadonlyArray<RigaMargineCommessa>): number {
  const preventivo = righe.reduce((s, r) => s + numero(r.preventivo_totale), 0);
  if (preventivo <= 0) return 0;
  const margine = righe.reduce((s, r) => s + numero(r.margine), 0);
  return Math.min(100, Math.max(-100, (margine / preventivo) * 100));
}

/** Gli id in blocchi, per tenere corta la richiesta `in.(…)`. */
export function idABlocchi(ids: ReadonlyArray<string>, dimensione = 100): string[][] {
  const blocchi: string[][] = [];
  for (let i = 0; i < ids.length; i += dimensione) blocchi.push(ids.slice(i, i + dimensione));
  return blocchi;
}
