import { describe, it, expect } from "vitest";
import {
  defaultQuotePaymentPhases,
  recalcPhaseAmounts,
  phasesPercentTotal,
  phasesAmountTotal,
  parseQuotePaymentPhases,
} from "@/lib/preventivi/paymentTerms";

describe("quote payment terms", () => {
  it("default plan is 30/70 deposit+balance", () => {
    const p = defaultQuotePaymentPhases();
    expect(p.map((x) => x.percent)).toEqual([30, 70]);
    expect(p.map((x) => x.type)).toEqual(["deposit", "balance"]);
  });

  it("recalc: amounts sum EXACTLY to total (last phase absorbs remainder)", () => {
    const phases = recalcPhaseAmounts(defaultQuotePaymentPhases(), 1000);
    expect(phases.map((p) => p.amount)).toEqual([300, 700]);
    expect(phasesAmountTotal(phases)).toBe(1000);
  });

  it("recalc: no drift with non-divisible split (33/33/34 on 100)", () => {
    const phases = recalcPhaseAmounts(
      [
        { label: "a", type: "deposit", percent: 33, amount: 0 },
        { label: "b", type: "deposit", percent: 33, amount: 0 },
        { label: "c", type: "balance", percent: 34, amount: 0 },
      ],
      100,
    );
    // somma esatta = 100, senza centesimi persi
    expect(phasesAmountTotal(phases)).toBe(100);
  });

  it("recalc: total still balances even if percentages don't sum to 100", () => {
    const phases = recalcPhaseAmounts(
      [
        { label: "a", type: "deposit", percent: 30, amount: 0 },
        { label: "b", type: "balance", percent: 30, amount: 0 },
      ],
      1000,
    );
    // l'ultima fase compensa: 300 + 700 = 1000
    expect(phasesAmountTotal(phases)).toBe(1000);
    expect(phases[1].amount).toBe(700);
  });

  it("recalc: never produces a negative last amount", () => {
    const phases = recalcPhaseAmounts(
      [
        { label: "a", type: "deposit", percent: 150, amount: 0 },
        { label: "b", type: "balance", percent: 0, amount: 0 },
      ],
      1000,
    );
    expect(phases[1].amount).toBeGreaterThanOrEqual(0);
  });

  it("recalc: percent sum > 100% with 3+ phases NEVER over-allocates (sum stays == total)", () => {
    // Regression: prima [800,800,0] su 1000 = 1600 (over-allocazione).
    const phases = recalcPhaseAmounts(
      [
        { label: "a", type: "deposit", percent: 80, amount: 0 },
        { label: "b", type: "deposit", percent: 80, amount: 0 },
        { label: "c", type: "balance", percent: 80, amount: 0 },
      ],
      1000,
    );
    expect(phasesAmountTotal(phases)).toBe(1000);
    expect(phases.every((p) => p.amount >= 0 && p.amount <= 1000)).toBe(true);
  });

  it("recalc: negative percent never yields a negative amount, total still balances", () => {
    // Regression: prima [-300, 1300] (acconto negativo).
    const phases = recalcPhaseAmounts(
      [
        { label: "a", type: "deposit", percent: -30, amount: 0 },
        { label: "b", type: "balance", percent: 130, amount: 0 },
      ],
      1000,
    );
    expect(phases.every((p) => p.amount >= 0)).toBe(true);
    expect(phasesAmountTotal(phases)).toBe(1000);
  });

  it("percent total sums percentages", () => {
    expect(phasesPercentTotal(defaultQuotePaymentPhases())).toBe(100);
  });

  it("parse is defensive against junk", () => {
    expect(parseQuotePaymentPhases(null)).toEqual([]);
    expect(parseQuotePaymentPhases("nope")).toEqual([]);
    expect(parseQuotePaymentPhases([{ label: "x", type: "weird", percent: "50", amount: null }])).toEqual([
      { label: "x", type: "deposit", percent: 50, amount: 0 },
    ]);
  });
});
