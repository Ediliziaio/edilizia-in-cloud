// ============================================================================
// commercialTrend — serie temporale per la reportistica CRM-vendite.
// Bucketizza le righe GIÀ scaricate (nessuna query nuova): settimanale fino a
// 120 giorni, mensile oltre. Stesse unità della lib report (importi in euro
// → cents con ×100). Date in locale (no toISOString, vedi bug UTC del progetto).
// ============================================================================
import {
  eachMonthOfInterval,
  eachWeekOfInterval,
  format,
  startOfMonth,
  startOfWeek,
  subDays,
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

export interface CommercialTrendPoint {
  key: string; // ISO della data di inizio bucket (stabile per chart key)
  label: string; // etichetta leggibile (es. "12 mag" o "mag 26")
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

/** Conta/somma le righe in ciascun bucket temporale del periodo. */
export function buildCommercialTrend(
  rows: CommercialTrendRows,
  daysBack: number,
  now: Date = new Date(),
): CommercialTrendPoint[] {
  const monthly = daysBack > 120;
  const start = subDays(now, daysBack);

  const bucketStarts = monthly
    ? eachMonthOfInterval({ start: startOfMonth(start), end: now })
    : eachWeekOfInterval({ start: startOfWeek(start, { weekStartsOn: 1 }), end: now }, { weekStartsOn: 1 });

  if (bucketStarts.length === 0) return [];

  const points: CommercialTrendPoint[] = bucketStarts.map((bucketStart) => ({
    key: bucketStart.toISOString(),
    label: monthly ? format(bucketStart, "MMM yy", { locale: it }) : format(bucketStart, "d MMM", { locale: it }),
    lead: 0,
    preventivi: 0,
    vinte: 0,
    fatturatoCents: 0,
    marginePct: null,
  }));
  const marginSum = bucketStarts.map(() => 0);
  const marginCount = bucketStarts.map(() => 0);

  // edge di fine di ciascun bucket (lo start del successivo, o now+1ms per l'ultimo)
  const edges = bucketStarts.map((d) => d.getTime());
  const findBucket = (date: Date | null): number => {
    if (!date) return -1;
    const t = date.getTime();
    if (t < edges[0]) return -1;
    // ultimo bucket il cui start <= t
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
  deltaPct: number | null; // null se il periodo precedente è a zero (nessun confronto sensato)
}

function roundOne(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Confronto periodo corrente vs precedente, di pari durata.
 * Richiede righe che coprano 2×daysBack (la finestra doppia): le divide a metà.
 */
export function buildPeriodComparison(
  rows: CommercialTrendRows,
  daysBack: number,
  now: Date = new Date(),
): PeriodComparisonMetric[] {
  const mid = subDays(now, daysBack);
  const start = subDays(now, daysBack * 2);
  const inRange = (d: Date | null, from: Date, to: Date) =>
    !!d && d.getTime() >= from.getTime() && d.getTime() < to.getTime();

  const agg = (from: Date, to: Date) => {
    let lead = 0;
    let preventivi = 0;
    let vinte = 0;
    let fatturatoCents = 0;
    for (const c of rows.contacts) if (inRange(parseDate(c.created_at), from, to)) lead += 1;
    for (const q of rows.quotes) if (inRange(parseDate(q.created_at), from, to)) preventivi += 1;
    for (const o of rows.orders) {
      if (inRange(parseDate(o.created_at), from, to)) {
        vinte += 1;
        fatturatoCents += toCents(o.total_amount);
      }
    }
    return { lead, preventivi, vinte, fatturatoCents };
  };

  const cur = agg(mid, now);
  const prev = agg(start, mid);
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
