export interface OrderChartMonth {
  comparison?: {
    year: number;
    venduto: number;
    incassato: number;
    commesse: number;
    daIncassare: number;
  };
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

/** Calendar cohorts, not historical snapshots of payment balances. End is exclusive. */
export function annualComparisonPeriod(year: number, now = new Date()) {
  if (!Number.isInteger(year) || year < 1901 || year > now.getFullYear())
    return null;
  const partial = year === now.getFullYear();
  const month = partial ? now.getMonth() : 11;
  const day = partial ? now.getDate() : 31;
  const end = (y: number) =>
    new Date(y, month, Math.min(day, new Date(y, month + 1, 0).getDate()) + 1);
  return {
    year,
    previousYear: year - 1,
    from: new Date(year, 0, 1),
    to: end(year),
    previousFrom: new Date(year - 1, 0, 1),
    previousTo: end(year - 1),
    label: partial
      ? `1 gennaio – ${now.toLocaleDateString("it-IT", { day: "numeric", month: "long" })}`
      : "1 gennaio – 31 dicembre",
    lastMonth: month,
  };
}
export type ChartComparisonPeriod = NonNullable<
  ReturnType<typeof annualComparisonPeriod>
>;
export interface ChartOrderValues {
  created_at: string;
  venduto: number;
  incassato: number;
  daIncassare: number;
}
export function comparableOrderMonths(
  template: OrderChartMonth[],
  current: ChartOrderValues[],
  previous: ChartOrderValues[],
  period: ChartComparisonPeriod,
): OrderChartMonth[] {
  const months = template.map((month) => ({
    ...month,
    venduto: 0,
    incassato: 0,
    commesse: 0,
    daIncassare: 0,
    comparison: {
      year: period.previousYear,
      venduto: 0,
      incassato: 0,
      commesse: 0,
      daIncassare: 0,
    },
  }));
  const add = (
    rows: ChartOrderValues[],
    from: Date,
    to: Date,
    prior: boolean,
  ) => {
    for (const row of rows) {
      const date = new Date(row.created_at);
      if (!(date >= from && date < to)) continue;
      const month = months.find(
        (m) => Number(m.key.slice(5)) === date.getMonth() + 1,
      );
      if (!month) continue;
      const target = prior ? month.comparison : month;
      target.commesse += 1;
      target.venduto += row.venduto;
      target.incassato += row.incassato;
      target.daIncassare += row.daIncassare;
    }
  };
  add(current, period.from, period.to, false);
  add(previous, period.previousFrom, period.previousTo, true);
  return months.map((month) =>
    Number(month.key.slice(5)) > period.lastMonth + 1
      ? { ...month, comparison: undefined }
      : month,
  );
}
