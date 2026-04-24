/**
 * Sales OS — Period preset helpers (Sprint 2)
 * Converts period key into { dateFrom, dateTo, daysBack, label }.
 */

export type SalesOSPeriod = 'today' | '7d' | '30d' | 'quarter' | 'ytd' | '12m';

export interface PeriodRange {
  key: SalesOSPeriod;
  label: string;
  dateFrom: string; // YYYY-MM-DD inclusive
  dateTo: string;   // YYYY-MM-DD exclusive (tomorrow for current)
  daysBack: number; // utile per RPC velocity
}

const toISODate = (d: Date) => d.toISOString().split('T')[0];

export function getPeriodRange(period: SalesOSPeriod, now: Date = new Date()): PeriodRange {
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateTo = toISODate(tomorrow);

  let dateFrom: Date;
  let daysBack: number;
  let label: string;

  switch (period) {
    case 'today':
      dateFrom = new Date(now);
      dateFrom.setHours(0, 0, 0, 0);
      daysBack = 1;
      label = 'Oggi';
      break;
    case '7d':
      dateFrom = new Date(now);
      dateFrom.setDate(dateFrom.getDate() - 7);
      daysBack = 7;
      label = 'Ultimi 7 giorni';
      break;
    case '30d':
      dateFrom = new Date(now);
      dateFrom.setDate(dateFrom.getDate() - 30);
      daysBack = 30;
      label = 'Ultimi 30 giorni';
      break;
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3);
      dateFrom = new Date(now.getFullYear(), q * 3, 1);
      daysBack = Math.max(1, Math.round((now.getTime() - dateFrom.getTime()) / 86400000));
      label = 'Trimestre in corso';
      break;
    }
    case 'ytd':
      dateFrom = new Date(now.getFullYear(), 0, 1);
      daysBack = Math.max(1, Math.round((now.getTime() - dateFrom.getTime()) / 86400000));
      label = 'Anno in corso';
      break;
    case '12m':
    default:
      dateFrom = new Date(now);
      dateFrom.setDate(dateFrom.getDate() - 365);
      daysBack = 365;
      label = 'Ultimi 12 mesi';
      break;
  }

  return {
    key: period,
    label,
    dateFrom: toISODate(dateFrom),
    dateTo,
    daysBack,
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
