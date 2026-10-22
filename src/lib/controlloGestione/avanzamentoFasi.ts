/**
 * Avanzamento fisico di una commessa «alla pari»: media delle percentuali
 * delle fasi, dove una fase completata (stato o 100%) vale 100. È la stessa
 * regola della scheda commessa (OrderDetail, order-phases-progress): così il
 * Controllo di gestione proietta il margine con lo stesso avanzamento.
 */
export interface FaseAvanzamento {
  order_id: string;
  status: string | null;
  percentuale: number | string | null;
}

export function percentualeFase(f: Pick<FaseAvanzamento, "status" | "percentuale">): number {
  const pct = Number(f.percentuale);
  if (f.status === "completata" || pct >= 100) return 100;
  return Math.min(100, Math.max(0, Number.isFinite(pct) ? pct : 0));
}

/** order_id → avanzamento 0–100. Le commesse senza fasi non compaiono. */
export function avanzamentoMedioFasi(fasi: FaseAvanzamento[]): Map<string, number> {
  const somme = new Map<string, { tot: number; n: number }>();
  for (const f of fasi) {
    const s = somme.get(f.order_id) ?? { tot: 0, n: 0 };
    s.tot += percentualeFase(f);
    s.n += 1;
    somme.set(f.order_id, s);
  }
  return new Map([...somme].map(([id, s]) => [id, s.tot / s.n]));
}
