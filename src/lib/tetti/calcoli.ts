export * from "@/lib/preventivi/calcoliComputo";

const n = (x: unknown) => { const v = Number(x); return Number.isFinite(v) ? v : 0; };

/**
 * Superficie REALE di falda a partire dalla superficie in pianta (footprint) e
 * dalla pendenza in %. La falda inclinata è più grande della proiezione in pianta:
 * area_falda = area_pianta / cos(α) = area_pianta × √(1 + (pendenza/100)²).
 * Es. 100 mq in pianta + 30% di pendenza → 104,4 mq di falda.
 */
export function calcSuperficieFalda(piantaMq: number, pendenzaPct: number): number {
  const p = Math.max(0, n(piantaMq));
  const pend = Math.max(0, n(pendenzaPct)) / 100;
  return p * Math.sqrt(1 + pend * pend);
}

/**
 * Stima della lattoneria dal perimetro dell'edificio (ml): i canali di gronda
 * corrono lungo il perimetro; i pluviali si stimano ~1 ogni 12 ml di gronda (min 2).
 * Valori di partenza editabili nel computo.
 */
export function stimaLattoneria(perimetroMl: number): { gronde_ml: number; pluviali_n: number } {
  const per = Math.max(0, n(perimetroMl));
  return { gronde_ml: Math.round(per), pluviali_n: per > 0 ? Math.max(2, Math.ceil(per / 12)) : 0 };
}
