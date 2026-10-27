export * from "@/lib/preventivi/calcoliComputo";

const n = (x: unknown) => { const v = Number(x); return Number.isFinite(v) ? v : 0; };

/**
 * Stima delle superfici di lavorazione da: superficie calpestabile totale (mq),
 * altezza media (m) e numero di vani. Pavimenti/soffitti = superficie; le pareti
 * sono stimate assumendo vani ~quadrati (perimetro = 4×√area_vano) × altezza.
 * Tinteggiature = pareti + soffitti. Valori di stima, arrotondati al mq.
 */
export function stimaSuperficiVani(
  mqTotali: number,
  hMedia: number,
  nVani: number,
): { pavimenti: number; soffitti: number; pareti: number; tinteggiature: number } {
  const mq = Math.max(0, n(mqTotali));
  const h = Math.max(0, n(hMedia));
  const vani = Math.max(1, Math.floor(Math.max(0, n(nVani))) || 1);
  const areaVano = mq / vani;
  const paretiTot = Math.round(4 * Math.sqrt(areaVano) * h * vani);
  const pavimenti = Math.round(mq);
  const soffitti = Math.round(mq);
  return { pavimenti, soffitti, pareti: paretiTot, tinteggiature: paretiTot + soffitti };
}
