/**
 * L'euro al centesimo, come lo stampa il preventivo.
 *
 * Il PDF scrive ogni importo con due decimali: righe, subtotali, imponibile, sconto, IVA,
 * totale. Perché quei numeri si sommino davvero, i conti si fanno sugli stessi centesimi
 * che si stampano: ogni riga è arrotondata, e il resto è somma e differenza di centesimi
 * interi (imponibile netto = lordo − sconto, totale = netto + IVA con l'IVA per differenza: vedi
 * `calcTotaliComputo` dei moduli).
 *
 * L'arrotondamento lo fa lo stesso `Intl.NumberFormat` di `formatCurrency` (ICU): arrotonda
 * le cifre decimali com'è scritto il numero («15382.035» → 15.382,04, a metà per eccesso)
 * e non il valore binario esatto, come invece fa `toFixed` (→ 15.382,03). Il motore che calcola è
 * quello che stampa, quindi l'importo calcolato si legge uguale a quello che prima veniva solo
 * stampato: nessuna cifra di riga cambia, cambiano solo le somme, che ora tornano.
 */
const A_DUE_DECIMALI = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });

/** I centesimi interi di un importo in euro; mai NaN, mai «-0». */
export function centesimi(euro: unknown): number {
  const n = Number(euro);
  if (!Number.isFinite(n)) return 0;
  return Number(A_DUE_DECIMALI.format(n).replace(".", "")) || 0;
}

/** Da centesimi interi a euro (il numero più vicino al centesimo scritto). */
export const euroDaCentesimi = (c: number): number => c / 100;
