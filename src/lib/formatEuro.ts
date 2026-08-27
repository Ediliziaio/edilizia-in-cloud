/**
 * Formatta un importo in euro per la UI: interi senza decimali, altrimenti 2
 * decimali, separatori it-IT, simbolo DOPO il numero come ovunque in italiano.
 * Es. 127 → "127 €", 88.9 → "88,90 €", 1234.5 → "1.234,50 €".
 */
export function formatEuro(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  const decimals = Number.isInteger(v) ? 0 : 2;
  return `${v.toLocaleString("it-IT", { minimumFractionDigits: decimals, maximumFractionDigits: 2, useGrouping: true })} €`;
}
