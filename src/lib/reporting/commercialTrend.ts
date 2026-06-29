// ============================================================================
// commercialTrend — serie temporale + confronto periodi per la reportistica
// CRM-vendite. Lavora su un RANGE esplicito {from, to} + granularità (giorno/
// settimana/mese). Le righe arrivano già filtrate alla finestra dal hook.
// Stesse unità della lib report (importi euro → cents ×100). Date in locale.
// ============================================================================
import {
  differenceInCalendarDays,
  eachDayOfInterval,
  eachMonthOfInterval,
  eachWeekOfInterval,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { it } from "date-fns/locale";

import type {
  CommercialContactRow,
  CommercialOrderRow,
  CommercialQuoteRow,
} from "@/lib/reporting/commercialPerformanceReport";

export interface CommercialTrendRows {
  contacts: CommercialContactRow[];
  quotes: CommercialQuoteRow[];
  orders: CommercialOrderRow[];
}

export type TimeGranularity = "day" | "week" | "month";

export interface CommercialTrendPoint {
  key: string; // ISO della data di inizio bucket (stabile per chart key)
  label: string;
  lead: number;
  preventivi: number;
  vinte: number;
  fatturatoCents: number;
  marginePct: number | null; // margine % medio dei preventivi nel bucket
}

export type CommercialTrendMetric = "fatturatoCents" | "preventivi" | "lead" | "vinte" | "marginePct";

function toNum(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function toCents(value: number | string | null | undefined): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
function roundOne(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Granularità sensata di default in base alla durata del range. */
export function autoGranularity(from: Date, to: Date): TimeGranularity {
  const days = Math.max(1, differenceInCalendarDays(to, from));
  if (days <= 31) return "day";
  if (days <= 180) return "week";
  return "month";
}

/** Conta/somma le righe (già filtrate al range) in ciascun bucket temporale. */
export function buildCommercialTrend(
  rows: CommercialTrendRows,
  range: { from: Date; to: Date; granularity?: TimeGranularity },
): CommercialTrendPoint[] {
  const { from, to } = range;
  const granularity = range.granularity ?? autoGranularity(from, to);

  const bucketStarts =
    granularity === "month"
      ? eachMonthOfInterval({ start: startOfMonth(from), end: to })
      : granularity === "week"
        ? eachWeekOfInterval({ start: startOfWeek(from, { weekStartsOn: 1 }), end: to }, { weekStartsOn: 1 })
        : eachDayOfInterval({ start: startOfDay(from), end: to });

  if (bucketStarts.length === 0) return [];

  const labelFmt = granularity === "month" ? "MMM yy" : "d MMM";
  const points: CommercialTrendPoint[] = bucketStarts.map((bucketStart) => ({
    key: bucketStart.toISOString(),
    label: format(bucketStart, labelFmt, { locale: it }),
    lead: 0,
    preventivi: 0,
    vinte: 0,
    fatturatoCents: 0,
    marginePct: null,
  }));
  const marginSum = bucketStarts.map(() => 0);
  const marginCount = bucketStarts.map(() => 0);

  const edges = bucketStarts.map((d) => d.getTime());
  const findBucket = (date: Date | null): number => {
    if (!date) return -1;
    const t = date.getTime();
    if (t < edges[0]) return -1;
    let idx = -1;
    for (let i = 0; i < edges.length; i++) {
      if (edges[i] <= t) idx = i;
      else break;
    }
    return idx;
  };

  for (const c of rows.contacts) {
    const i = findBucket(parseDate(c.created_at));
    if (i >= 0) points[i].lead += 1;
  }
  for (const q of rows.quotes) {
    const i = findBucket(parseDate(q.created_at));
    if (i >= 0) {
      points[i].preventivi += 1;
      const m = toNum(q.margine_totale_percentuale);
      if (m !== null) {
        marginSum[i] += m;
        marginCount[i] += 1;
      }
    }
  }
  for (const o of rows.orders) {
    const i = findBucket(parseDate(o.created_at));
    if (i >= 0) {
      points[i].vinte += 1;
      points[i].fatturatoCents += toCents(o.total_amount);
    }
  }

  points.forEach((p, i) => {
    p.marginePct = marginCount[i] > 0 ? roundOne(marginSum[i] / marginCount[i]) : null;
  });

  return points;
}

export interface PeriodComparisonMetric {
  key: CommercialTrendMetric;
  label: string;
  money?: boolean;
  current: number;
  previous: number;
  deltaPct: number | null; // null se il periodo di confronto è a zero
}

/** Aggrega le righe di un periodo (già filtrate alla finestra dal hook). */
function aggregatePeriod(rows: CommercialTrendRows) {
  return {
    lead: rows.contacts.length,
    preventivi: rows.quotes.length,
    vinte: rows.orders.length,
    fatturatoCents: rows.orders.reduce((s, o) => s + toCents(o.total_amount), 0),
  };
}

/**
 * Confronto del periodo corrente vs un periodo di base (precedente o anno scorso).
 * Ogni set di righe è già filtrato alla sua finestra dal hook → qui si aggrega e basta.
 */
export function buildPeriodComparison(
  current: CommercialTrendRows,
  baseline: CommercialTrendRows,
): PeriodComparisonMetric[] {
  const cur = aggregatePeriod(current);
  const prev = aggregatePeriod(baseline);
  const delta = (c: number, p: number) => (p === 0 ? null : roundOne(((c - p) / p) * 100));
  return [
    { key: "fatturatoCents", label: "Fatturato", money: true, current: cur.fatturatoCents, previous: prev.fatturatoCents, deltaPct: delta(cur.fatturatoCents, prev.fatturatoCents) },
    { key: "preventivi", label: "Preventivi", current: cur.preventivi, previous: prev.preventivi, deltaPct: delta(cur.preventivi, prev.preventivi) },
    { key: "lead", label: "Lead", current: cur.lead, previous: prev.lead, deltaPct: delta(cur.lead, prev.lead) },
    { key: "vinte", label: "Vendite", current: cur.vinte, previous: prev.vinte, deltaPct: delta(cur.vinte, prev.vinte) },
  ];
}

export const TREND_METRICS: Array<{ key: CommercialTrendMetric; label: string; money?: boolean; percent?: boolean }> = [
  { key: "fatturatoCents", label: "Fatturato", money: true },
  { key: "preventivi", label: "Preventivi" },
  { key: "lead", label: "Lead" },
  { key: "vinte", label: "Vendite" },
  { key: "marginePct", label: "Margine %", percent: true },
];
