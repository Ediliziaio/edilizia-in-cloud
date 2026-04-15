import type { WidgetConfig } from "@/lib/dashboardBuilder/types";

export function formatValue(value: number | null | undefined, config?: WidgetConfig): string {
  if (value == null || Number.isNaN(value)) return "—";
  const format = config?.format ?? {};
  const decimals = format.decimals ?? (format.currency ? 2 : 0);
  const formatter = new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const n = formatter.format(value);
  if (format.currency === "EUR") return `€ ${n}`;
  if (format.currency === "USD") return `$ ${n}`;
  const prefix = format.prefix ?? "";
  const suffix = format.suffix ?? "";
  return `${prefix}${n}${suffix}`;
}

export function formatShort(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return Math.round(value).toString();
}
