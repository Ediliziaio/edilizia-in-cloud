/**
 * Le percentuali del preventivo, scritte all'italiana: virgola, fino a due decimali e
 * senza zeri inutili («22%», «7,5%», «7,25%»). Il PDF le scriveva col punto («7.5%») e le
 * accorciava a un decimale («7,25%» diventava «7,3%» accanto a un importo calcolato sul 7,25).
 */

/** Il numero senza il segno: «7,5», «22», «7,25». */
export function numeroPercentuale(valore: unknown): string {
  const n = Number(valore);
  const x = Number.isFinite(n) && n !== 0 ? n : 0;
  return x.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** «7,5%», «22%». */
export const percentualeIt = (valore: unknown): string => `${numeroPercentuale(valore)}%`;
