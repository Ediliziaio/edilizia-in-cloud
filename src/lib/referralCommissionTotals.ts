import { subDays } from "date-fns";

const romeMonth = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
  month: "numeric",
  year: "numeric",
});

type CommissionPeriod = { month: number; year: number };
type CommissionAmount = { status: string | null; commission_amount: number | null };

type MonthlyCommission = CommissionAmount & {
  period_month: number | null;
  period_year: number | null;
};

type CommissionMovement = {
  cash_paid_at: string | null;
  calculated_at: string | null;
  commission_type: string | null;
  commission_amount: number | null;
};

const cents = (amount: number | null) => Math.round((amount ?? 0) * 100);
const bookedCents = (entry: CommissionAmount) =>
  entry.status == null || entry.status === "cancelled" ? 0 : cents(entry.commission_amount);

export function referralCommissionPeriod(date = new Date()): CommissionPeriod {
  const parts = romeMonth.formatToParts(date);
  return {
    month: Number(parts.find((part) => part.type === "month")?.value),
    year: Number(parts.find((part) => part.type === "year")?.value),
  };
}

export function sumBookedReferralCommissions(rows: CommissionAmount[]): number {
  return rows.reduce((sum, entry) => sum + bookedCents(entry), 0) / 100;
}

export function referralCommissionMonths({ month, year }: CommissionPeriod): CommissionPeriod[] {
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 6 + index, 1));
    return { month: date.getUTCMonth() + 1, year: date.getUTCFullYear() };
  });
}

export function monthlyReferralCommissionSeries(rows: MonthlyCommission[], periods: CommissionPeriod[]) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.period_year}-${row.period_month}`;
    totals.set(key, (totals.get(key) ?? 0) + bookedCents(row));
  }

  return periods.map(({ month, year }) => ({
    month: `${String(month).padStart(2, "0")}/${String(year).slice(-2)}`,
    total: (totals.get(`${year}-${month}`) ?? 0) / 100,
  }));
}

export function referralPerformanceWindow(anchorMs: number, days: number) {
  const now = new Date(anchorMs);
  return { now, currentFrom: subDays(now, days), previousFrom: subDays(now, days * 2) };
}

export function sumReferralPerformanceMovements(
  movements: CommissionMovement[],
  { now, currentFrom, previousFrom }: ReturnType<typeof referralPerformanceWindow>,
) {
  let current = 0;
  let previous = 0;
  for (const movement of movements) {
    const timestamp = movement.commission_type === "stripe_receipt" ? movement.cash_paid_at : movement.calculated_at;
    if (!timestamp) continue;
    const time = new Date(timestamp);
    if (time >= currentFrom && time <= now) current += cents(movement.commission_amount);
    else if (time >= previousFrom && time < currentFrom) previous += cents(movement.commission_amount);
  }
  return { current: current / 100, previous: previous / 100 };
}
