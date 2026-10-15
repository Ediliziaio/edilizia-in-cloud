/** Read every page: API row limits must never turn a page into a company total. */
export async function readAllOrderRows<T>(read: (from: number, to: number) => PromiseLike<{data: T[] | null; error: unknown}>, size = 500): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += size) {
    const {data, error} = await read(from, from + size - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < size) return rows;
  }
}

export interface OrderMarginRow {
  id: string | null;
  preventivo_totale: number | null;
  consuntivo: number | null;
  margine: number | null;
  margine_perc: number | null;
}
export type MarginKind = "negative_margin" | "low_margin" | "missing_costs" | "good";
export type OrderFocus = "all" | MarginKind | "missing_data";

export function orderMarginKind(row?: OrderMarginRow): MarginKind {
  if (!row || !Number.isFinite(row.preventivo_totale) || !Number.isFinite(row.consuntivo)
    || !Number.isFinite(row.margine) || !Number.isFinite(row.margine_perc)
    || Number(row.preventivo_totale) <= 0 || Number(row.consuntivo) <= 0) return "missing_costs";
  if (Number(row.margine) < 0) return "negative_margin";
  return Number(row.margine_perc) < 20 ? "low_margin" : "good";
}

export function orderMarginGroups(ids: string[], rows: OrderMarginRow[]) {
  const byId = new Map(rows.map(row => [row.id, row]));
  const groups: Record<MarginKind, string[]> = {negative_margin: [], low_margin: [], missing_costs: [], good: []};
  for (const id of ids) groups[orderMarginKind(byId.get(id))].push(id);
  return groups;
}

export const ORDER_FOCUS_LABELS: Record<OrderFocus, string> = {
  all: "Tutte le commesse", negative_margin: "Margine negativo", low_margin: "Margine sotto il 20%",
  missing_costs: "Costi da completare", missing_data: "Dati da completare", good: "Margine almeno al 20%",
};
