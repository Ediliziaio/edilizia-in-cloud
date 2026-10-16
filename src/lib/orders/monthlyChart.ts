export interface OrderChartMonth {
  key: string;
  mese: string;
  venduto: number;
  incassato: number;
  commesse: number;
  daIncassare: number;
}

/** Future empty months are unavailable, rather than an apparent fall to zero.
 * Keep real data even if a record was created with a future timestamp. */
export function orderChartMonths(months: OrderChartMonth[], now = new Date()) {
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return months.map((month) => {
    const future = month.key > currentKey;
    const unavailable =
      future &&
      month.commesse === 0 &&
      month.venduto === 0 &&
      month.incassato === 0 &&
      month.daIncassare === 0;
    return {
      ...month,
      future,
      current: month.key === currentKey,
      sold: unavailable ? null : month.venduto,
      collected: unavailable ? null : month.incassato,
      count: unavailable ? null : month.commesse,
    };
  });
}
export type DisplayChartMonth = ReturnType<typeof orderChartMonths>[number];
export const chartMoney = (value: number) =>
  value.toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });

/** Resolve real chart events across Recharts versions; ignore empty space/future months. */
export function clickedOrderChartMonth(
  event: unknown,
  months: DisplayChartMonth[],
) {
  if (!event || typeof event !== "object") return null;
  const state = event as {
    activeLabel?: unknown;
    activeTooltipIndex?: unknown;
  };
  const byLabel = months.find((month) => month.mese === state.activeLabel);
  const index = state.activeTooltipIndex;
  const byIndex =
    typeof index === "number" ||
    (typeof index === "string" && /^\d+$/.test(index))
      ? months[Number(index)]
      : undefined;
  const month = byLabel ?? byIndex;
  return month && month.count !== null ? month.key : null;
}

/** Keep the existing filters, but select the actual year represented in the chart. */
export function orderChartMonthFilter(
  key: string | null,
  yearFilter: string,
  currentYear: number,
  scopeGroup = "all",
) {
  if (key === null)
    return { monthFilter: "all", contractFrom: "", contractTo: "" };
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(key);
  if (!match) return null;
  const year = Number(match[1]);
  return {
    monthFilter: String(Number(match[2]) - 1),
    contractFrom: "",
    contractTo: "",
    yearFilter:
      yearFilter === "corrente" && year === currentYear
        ? "corrente"
        : String(year),
    scopeGroup:
      yearFilter === "corrente" && year === currentYear
        ? scopeGroup === "previous" || scopeGroup === "annual"
          ? "annual"
          : "all"
        : "all",
  };
}
