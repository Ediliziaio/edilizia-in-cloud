import type { VoceSim } from "./tipi";

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export function calcolaVoce(v: VoceSim) {
  const imponibile_costo = round2(v.quantita * v.costo_unitario);
  const imponibile_ricavo = round2(v.quantita * v.prezzo_unitario);
  return { imponibile_costo, imponibile_ricavo, margine: round2(imponibile_ricavo - imponibile_costo) };
}

export function calcolaTotali(voci: VoceSim[]) {
  let costo_totale = 0, ricavo_imponibile = 0;
  for (const v of voci) {
    const r = calcolaVoce(v);
    costo_totale += r.imponibile_costo;
    ricavo_imponibile += r.imponibile_ricavo;
  }
  costo_totale = round2(costo_totale);
  ricavo_imponibile = round2(ricavo_imponibile);
  const margine_valore = round2(ricavo_imponibile - costo_totale);
  const margine_pct = ricavo_imponibile > 0 ? round2((margine_valore / ricavo_imponibile) * 100) : 0;
  return { costo_totale, ricavo_imponibile, margine_valore, margine_pct };
}
