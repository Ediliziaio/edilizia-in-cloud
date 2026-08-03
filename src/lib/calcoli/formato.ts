/**
 * Formattatori italiani condivisi dai calcolatori.
 *
 * Vivono qui e non nel file del componente perché esportare funzioni da un
 * modulo che esporta anche componenti rompe il fast refresh di Vite.
 */

// useGrouping esplicito: il default CLDR per l'italiano ha
// minimumGroupingDigits = 2, quindi 2500 esce "2500,00 €" mentre 99500 esce
// "99.500,00 €". Affiancati nella stessa schermata sembra un errore, e non è
// il modo in cui gli importi compaiono su una fattura. Raggruppiamo sempre.
export const eur = (n: number) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(Number.isFinite(n) ? n : 0);

export const pct = (n: number, decimali = 2) =>
  `${new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: decimali,
    maximumFractionDigits: decimali,
  }).format(Number.isFinite(n) ? n : 0)}%`;

export const num = (n: number, decimali = 0) =>
  new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: decimali,
    maximumFractionDigits: decimali,
  }).format(Number.isFinite(n) ? n : 0);
