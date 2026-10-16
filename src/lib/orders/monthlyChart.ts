export interface OrderChartMonth {
  key: string;
  mese: string;
  venduto: number;
  incassato: number;
  commesse: number;
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
      month.incassato === 0;
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
