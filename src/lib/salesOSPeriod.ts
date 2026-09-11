/**
 * Sales OS — Period preset helpers (Sprint 2)
 * Converts period key into { dateFrom, dateTo, daysBack, label }.
 *
 * Le date sono giorni LOCALI (italiani). Prima si usava toISOString, che dà il
 * giorno UTC: in Italia «Oggi» cominciava ieri, trimestre e anno un giorno
 * prima, e fra mezzanotte e le 2 il giorno corrente restava fuori. E «Ultimi
 * 7 giorni» copriva 8 giorni di calendario mentre la velocity ne contava 7:
 * ora ogni periodo è oggi più i giorni precedenti, e daysBack ne è il numero
 * esatto (la funzione del database prende gli ultimi daysBack giorni, oggi
 * compreso).
 */

export type SalesOSPeriod = 'today' | '7d' | '30d' | 'quarter' | 'ytd' | '12m';

export interface PeriodRange {
  key: SalesOSPeriod;
  label: string;
  dateFrom: string; // YYYY-MM-DD inclusive
  dateTo: string;   // YYYY-MM-DD exclusive (tomorrow for current)
  daysBack: number; // giorni del periodo, oggi compreso (per la RPC velocity)
}

export const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function giornoLocale(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function giorniPrima(oggi: Date, giorni: number) {
  return new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() - giorni);
}

/** Giorni di calendario da `da` a `a`, entrambi compresi (arrotonda l'ora legale). */
function giorniCompresi(da: Date, a: Date) {
  return Math.round((giornoLocale(a).getTime() - giornoLocale(da).getTime()) / 86400000) + 1;
}

export function getPeriodRange(period: SalesOSPeriod, now: Date = new Date()): PeriodRange {
  const oggi = giornoLocale(now);
  const dateTo = toISODate(giorniPrima(oggi, -1));

  let dateFrom: Date;
  let label: string;

  switch (period) {
    case 'today':
      dateFrom = oggi;
      label = 'Oggi';
      break;
    case '7d':
      dateFrom = giorniPrima(oggi, 6);
      label = 'Ultimi 7 giorni';
      break;
    case '30d':
      dateFrom = giorniPrima(oggi, 29);
      label = 'Ultimi 30 giorni';
      break;
    case 'quarter':
      dateFrom = new Date(oggi.getFullYear(), Math.floor(oggi.getMonth() / 3) * 3, 1);
      label = 'Trimestre in corso';
      break;
    case 'ytd':
      dateFrom = new Date(oggi.getFullYear(), 0, 1);
      label = 'Anno in corso';
      break;
    case '12m':
    default:
      dateFrom = giorniPrima(oggi, 364);
      label = 'Ultimi 12 mesi';
      break;
  }

  return {
    key: period,
    label,
    dateFrom: toISODate(dateFrom),
    dateTo,
    daysBack: giorniCompresi(dateFrom, oggi),
  };
}

export const PERIOD_OPTIONS: Array<{ value: SalesOSPeriod; label: string }> = [
  { value: 'today', label: 'Oggi' },
  { value: '7d', label: '7 giorni' },
  { value: '30d', label: '30 giorni' },
  { value: 'quarter', label: 'Trimestre' },
  { value: 'ytd', label: 'YTD' },
  { value: '12m', label: '12 mesi' },
];
