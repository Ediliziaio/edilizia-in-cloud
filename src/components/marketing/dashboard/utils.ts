/**
 * Shared formatters and utilities for the Marketing Dashboard components.
 * Centralized to avoid duplication across KPI cards, tables, and charts.
 */

const currencyFormatter = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("it-IT");

/** Format a number as Italian-locale number */
export const fmt = (n: number): string => numberFormatter.format(n);

/** Format a number as EUR currency (no decimals) */
export const fmtCur = (n: number): string => currencyFormatter.format(n);

/** Format a KPI value based on its type */
export function formatValue(value: number, format: "number" | "currency" | "percent"): string {
  if (format === "currency") return fmtCur(value);
  if (format === "percent") return `${value}%`;
  return fmt(value);
}

/** Calculate delta percentage between current and previous period */
export function calcDelta(
  curr: number,
  prev: number
): { value: number; direction: "up" | "down" | "flat" } {
  if (prev === 0 && curr === 0) return { value: 0, direction: "flat" };
  if (prev === 0) return { value: 100, direction: "up" };
  const delta = ((curr - prev) / prev) * 100;
  return {
    value: Math.abs(Math.round(delta)),
    direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
  };
}

/** Safely format a duration in seconds to human-readable "Xm Ys" */
export function formatDuration(seconds: number): string {
  if (!seconds) return "0s";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
