import { expect, it } from "vitest";
import {
  monthlyReferralCommissionSeries, referralCommissionMonths, referralCommissionPeriod,
  referralPerformanceWindow, sumBookedReferralCommissions, sumReferralPerformanceMovements,
} from "@/lib/referralCommissionTotals";

it("esclude gli annullati come il saldo e mostra i sei mesi fino al periodo scelto", () => {
  const rows = [
    { period_year: 2025, period_month: 12, status: "pending", commission_amount: 72 },
    { period_year: 2025, period_month: 12, status: "pending", commission_amount: -18 },
    { period_year: 2025, period_month: 12, status: "cancelled", commission_amount: -10 },
    { period_year: 2025, period_month: 12, status: null, commission_amount: 50 },
    { period_year: 2026, period_month: 1, status: "paid", commission_amount: 14 },
    { period_year: 2026, period_month: 2, status: "approved", commission_amount: 30 },
  ];
  expect(sumBookedReferralCommissions(rows.filter((row) => row.period_month === 12))).toBe(54);
  expect(monthlyReferralCommissionSeries(rows, referralCommissionMonths({ month: 1, year: 2026 }))).toEqual([
    { month: "08/25", total: 0 }, { month: "09/25", total: 0 },
    { month: "10/25", total: 0 }, { month: "11/25", total: 0 },
    { month: "12/25", total: 54 }, { month: "01/26", total: 14 },
  ]);
  expect(referralCommissionPeriod(new Date("2025-12-31T23:30:00Z"))).toEqual({ month: 1, year: 2026 });
});

it("include incassi e storni arrivati dopo l'apertura di Performance", () => {
  const movements = [
    { cash_paid_at: "2026-11-21T10:01:00Z", calculated_at: "2026-11-12T10:01:00Z", commission_type: "stripe_receipt", commission_amount: 72 },
    { cash_paid_at: "2026-11-12T10:01:00Z", calculated_at: "2026-11-21T10:02:00Z", commission_type: "stripe_refund", commission_amount: -18 },
    { cash_paid_at: "2026-11-11T10:01:00Z", calculated_at: "2026-11-21T10:02:00Z", commission_type: "stripe_receipt", commission_amount: 60 },
  ];
  const openedAt = Date.parse("2026-11-21T10:00:00Z");
  const refreshedAt = Date.parse("2026-11-21T10:03:00Z");
  expect(sumReferralPerformanceMovements(movements, referralPerformanceWindow(openedAt, 7))).toEqual({ current: 0, previous: 60 });
  expect(sumReferralPerformanceMovements(movements, referralPerformanceWindow(refreshedAt, 7))).toEqual({ current: 54, previous: 60 });
});
