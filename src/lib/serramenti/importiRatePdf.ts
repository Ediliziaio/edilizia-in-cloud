/** Importi al centesimo; il saldo assorbe l'arrotondamento solo per piani al 100%. */
export function importiRatePdf(totale: number, percentuali: number[]): number[] {
  const centesimi = Math.round(totale * 100);
  const importi = percentuali.map(p => Math.round(centesimi * p / 100));
  const sommaPercentuali = percentuali.reduce((s, p) => s + p, 0);
  if (importi.length && Math.abs(sommaPercentuali - 100) < 0.000001) {
    importi[importi.length - 1] += centesimi - importi.reduce((s, v) => s + v, 0);
  }
  return importi.map(v => v / 100);
}
