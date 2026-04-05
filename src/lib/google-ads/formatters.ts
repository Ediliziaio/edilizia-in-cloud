/**
 * Formattatori numerici e date in formato it-IT per Google Ads.
 * Tutti i valori vengono visualizzati con la localizzazione italiana.
 */

/** Formatta un numero come valuta EUR in italiano */
export const formatCurrency = (n: number): string =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);

/** Formatta una percentuale con 2 decimali in italiano */
export const formatPercent = (n: number): string =>
  `${n.toFixed(2).replace(".", ",")}%`;

/** Formatta un numero intero in italiano */
export const formatNumber = (n: number): string =>
  Math.round(n).toLocaleString("it-IT");

/** Formatta una data in italiano */
export const formatDate = (d: Date): string =>
  new Intl.DateTimeFormat("it-IT").format(d);

/** Formatta una stringa data "YYYY-MM-DD" come "dd/mm/yyyy" */
export const formatDateShort = (dateStr: string): string => {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
};

/** Calcola il CTR (click-through rate) come percentuale */
export const calcCTR = (clicks: number, impressions: number): number =>
  impressions > 0 ? (clicks / impressions) * 100 : 0;

/** Calcola il CPC (cost per click) in euro */
export const calcCPC = (spend: number, clicks: number): number =>
  clicks > 0 ? spend / clicks : 0;
