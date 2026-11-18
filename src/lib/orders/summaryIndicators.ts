import type { OrderMarginRow } from "./listScope";

/** Margine ponderato sul venduto netto; i costi mancanti non sono un utile del 100%. */
export function directMarginSummary(rows: readonly OrderMarginRow[], ids: ReadonlySet<string>) {
  let revenue = 0, costs = 0, count = 0, missing = 0;
  const byId = new Map(rows.filter(row => row.id).map(row => [row.id!, row]));
  for (const id of ids) {
    const row = byId.get(id);
    if (!row || row.preventivo_totale == null || row.consuntivo == null
      || !Number.isFinite(row.preventivo_totale) || !Number.isFinite(row.consuntivo)
      || row.preventivo_totale <= 0 || row.consuntivo <= 0) { missing++; continue; }
    revenue += row.preventivo_totale;
    costs += row.consuntivo;
    count++;
  }
  const margin = count ? revenue - costs : null;
  return { revenue, costs, margin, percentage: revenue > 0 ? ((revenue - costs) / revenue) * 100 : null, count, missing };
}

/** Debiti registrati: esclude impegni senza fattura e prestazioni ancora da maturare. */
export function registeredPayables(rows: readonly { stato: string; residuo: number }[]) {
  return rows.reduce((sum, row) => ["scaduto", "da_pagare", "parziale"].includes(row.stato)
    && Number.isFinite(row.residuo) ? sum + Math.max(0, row.residuo) : sum, 0);
}

/** Incassato e residuo condividono una scheda; il posto libero rende visibile il venduto. */
export function groupedSummaryCards<T extends string>(cards: readonly T[]): (T | "venduto")[] {
  if (!cards.includes("incassato" as T) || !cards.includes("da_incassare" as T)) return [...cards];
  const grouped = cards.filter(id => id !== "da_incassare");
  return grouped.includes("venduto" as T) ? grouped : ["venduto", ...grouped];
}

/** Scorporo per singola commessa: le aliquote diverse non vanno sostituite con una media fissa. */
export function netOrderTotals(rows: readonly { sold: number; collected: number; pending: number; vatRate: number | null }[]) {
  const totals = { sold: 0, collected: 0, pending: 0 };
  let missing = 0;
  for (const row of rows) {
    if (row.vatRate == null || !Number.isFinite(row.vatRate) || row.vatRate < 0) {
      if (row.sold !== 0 || row.collected !== 0 || row.pending !== 0) missing++;
      continue;
    }
    for (const key of ["sold", "collected", "pending"] as const) totals[key] += Math.round(row[key] / (1 + row.vatRate / 100) * 100);
  }
  return { sold: missing ? null : totals.sold / 100, collected: missing ? null : totals.collected / 100, pending: missing ? null : totals.pending / 100, missing };
}
