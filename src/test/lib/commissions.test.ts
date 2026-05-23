import { describe, expect, it } from "vitest";
import {
  buildCommissionBreakdown,
  calculateCollectedNetFromInstallments,
  calculateCommissionMarginImpact,
  calculateCommissionGross,
  calculateCommissionNet,
  calculateStoredCommissionNet,
  deriveVariableCompensationStatus,
} from "@/lib/commissions";

describe("commission calculations", () => {
  it("calculates fixed, sold-percentage and margin-percentage commissions", () => {
    expect(calculateCommissionGross({ commissionType: "fixed", commissionValue: 500, totalAmount: 10000 })).toBe(500);
    expect(calculateCommissionGross({ commissionType: "percentage_sold", commissionValue: 3, totalAmount: 10000 })).toBe(300);
    expect(calculateCommissionGross({ commissionType: "percentage_margin", commissionValue: 10, marginAmount: 2400 })).toBe(240);
  });

  it("calculates collected-percentage commissions on collected net amount", () => {
    expect(
      calculateCommissionGross({
        commissionType: "percentage_collected",
        commissionValue: 5,
        totalAmount: 10000,
        collectedAmount: 2000,
      })
    ).toBe(100);
  });

  it("zeros commission for fixed-only compensation mode", () => {
    expect(
      calculateCommissionGross({
        compensationMode: "fixed_only",
        commissionType: "percentage_sold",
        commissionValue: 10,
        totalAmount: 10000,
        collectedAmount: 10000,
      })
    ).toBe(0);
  });

  it("keeps deductions separate from stored gross commission", () => {
    expect(calculateCommissionNet({ commissionType: "percentage_sold", commissionValue: 4, totalAmount: 10000, deductionAmount: 50 })).toBe(350);
    expect(calculateStoredCommissionNet(400, 50)).toBe(350);
  });

  it("does not turn over-deductions into negative payable commissions", () => {
    expect(calculateCommissionNet({ commissionType: "fixed", commissionValue: 100, deductionAmount: 250 })).toBe(0);
    expect(calculateStoredCommissionNet(100, 250)).toBe(0);
  });

  it("rounds percentage commissions to cents", () => {
    expect(calculateCommissionGross({ commissionType: "percentage_sold", commissionValue: 2.5, totalAmount: 999.99 })).toBe(25);
  });

  it("converts paid gross installments to collected net amount", () => {
    const collectedNet = calculateCollectedNetFromInstallments({
      totalAmount: 10000,
      vatRate: 22,
      installments: [
        { type: "deposit", amount: 2440, is_paid: true },
        { type: "balance", amount: 9760, is_paid: false },
      ],
    });

    expect(collectedNet).toBeCloseTo(2000, 2);
  });

  it("does not mature collected-percentage commissions without paid installments", () => {
    const collectedNet = calculateCollectedNetFromInstallments({
      totalAmount: 10000,
      vatRate: 22,
      installments: [
        { type: "deposit", amount: 2440, is_paid: false },
        { type: "balance", amount: 9760, is_paid: false },
      ],
    });

    expect(collectedNet).toBe(0);
    expect(
      calculateCommissionGross({
        commissionType: "percentage_collected",
        commissionValue: 5,
        totalAmount: 10000,
        collectedAmount: collectedNet,
      })
    ).toBe(0);
  });

  it("derives operational statuses for variable compensation", () => {
    expect(deriveVariableCompensationStatus({ isPaid: true, netAmount: 100 }).status).toBe("paid");
    expect(
      deriveVariableCompensationStatus({
        commissionType: "percentage_collected",
        soldAmount: 10000,
        collectedAmount: 0,
        grossAmount: 0,
        netAmount: 0,
      }).status
    ).toBe("estimated");
    expect(deriveVariableCompensationStatus({ grossAmount: 500, deductionAmount: 150, errorCount: 1 }).status).toBe("disputed");
    expect(deriveVariableCompensationStatus({ grossAmount: 500, netAmount: 500, today: new Date("2026-05-01"), paymentExpectedDate: "2026-06-01" }).status).toBe("matured");
    expect(deriveVariableCompensationStatus({ grossAmount: 500, netAmount: 500, today: new Date("2026-05-01") }).status).toBe("payable");
  });

  it("builds a commission calculation breakdown", () => {
    const breakdown = buildCommissionBreakdown({
      grossAmount: 600,
      incentivesAmount: 100,
      deductionAmount: 50,
      netAmount: 650,
    });

    expect(breakdown.map((line) => line.amount)).toEqual([600, 100, -50, 650]);
  });

  it("calculates margin impact after commissions", () => {
    const impact = calculateCommissionMarginImpact({
      revenueNet: 10000,
      variableCosts: 7500,
      commissionNet: 1000,
    });

    expect(impact.marginBeforeCommission).toBe(2500);
    expect(impact.marginAfterCommission).toBe(1500);
    expect(impact.marginAfterPercent).toBe(15);
    expect(impact.risk).toBe("watch");
  });
});
