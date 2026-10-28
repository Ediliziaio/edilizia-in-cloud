import { describe, it, expect } from "vitest";
import {
  compareForecastScenarios,
  forecastRisk,
  forecastTooltipAmount,
  movementTotals,
} from "@/lib/finance/forecastInsights";
import {
  projectForecast,
  vatEstimates,
  emptyForecastSources,
  buildForecastLedger,
  type ForecastScenario,
} from "@/lib/finance/forecastLedger";
import { forecastFixture } from "@/test/fixtures/forecastDataset";
const scenario: ForecastScenario = {
  delayDays: 0,
  includeEstimates: true,
  includeOverdueIncome: false,
  includeOverdueExpense: false,
};
describe("forecast clarity and safeguards", () => {
  it("never hides the sign of a negative cash balance", () => {
    expect(forecastTooltipAmount(-10000, "balance")).toBe(-10000);
    expect(forecastTooltipAmount(-10000, "withoutEstimates")).toBe(-10000);
    expect(forecastTooltipAmount(-10000, "expense")).toBe(10000);
  });
  it("compares equal assumptions without modifying source dates or manual overrides", () => {
    const before = JSON.stringify(forecastFixture.movements);
    const rows = compareForecastScenarios({
      movements: forecastFixture.movements,
      opening: 1000000,
      today: forecastFixture.today,
      horizon: 30,
      threshold: 500000,
      scenario,
      realDelay: null,
    });
    expect(rows[0].projection?.finalBalance).toBe(1300000);
    expect(rows[1].projection).toBeNull();
    expect(rows[3].projection?.finalBalance).toBe(-200000);
    expect(
      rows[3].projection?.outside.find((m) => m.id === "customer")?.cents,
    ).toBe(1500000);
    expect(JSON.stringify(forecastFixture.movements)).toBe(before);
    const fixed = compareForecastScenarios({
      movements: forecastFixture.movements,
      opening: 1000000,
      today: forecastFixture.today,
      horizon: 30,
      threshold: 500000,
      scenario: { ...scenario, dateOverrides: { customer: "2026-10-17" } },
      realDelay: 0,
    });
    expect(
      fixed.every(
        (r) =>
          r.projection?.included.find((m) => m.id === "customer")?.date ===
          "2026-10-17",
      ),
    ).toBe(true);
  });
  it("counts days below threshold and the first recovery, not just the final positive balance", () => {
    const projection = projectForecast(
      forecastFixture.movements,
      1000000,
      forecastFixture.today,
      30,
      500000,
      scenario,
    );
    expect(forecastRisk(projection, 500000)).toMatchObject({
      daysBelow: 2,
      first: "2026-10-14",
      recovery: "2026-10-16",
    });
    expect(
      forecastRisk(
        projectForecast([], null, forecastFixture.today, 30, 0, scenario),
        0,
      ).daysBelow,
    ).toBeNull();
    expect(
      movementTotals([
        { ...forecastFixture.movements[0], direction: "in", cents: 50000 },
        forecastFixture.movements[3],
      ]),
    ).toEqual({ in: 50000, out: 50000 });
  });
  it("keeps VAT opt-in independent of payroll and other estimates", () => {
    const movements = [
      { ...forecastFixture.movements[0], estimated: true, source: "Stima IVA" },
      {
        ...forecastFixture.movements[1],
        estimated: true,
        source: "Stima personale",
        direction: "out" as const,
      },
    ];
    const p = projectForecast(
      movements,
      1000000,
      forecastFixture.today,
      30,
      0,
      { ...scenario, includeVatEstimates: false },
    );
    expect(p.included.map((m) => m.source)).toEqual(["Stima personale"]);
    expect(p.excludedEstimates.map((m) => m.source)).toEqual(["Stima IVA"]);
  });
  it("does not suppress a VAT estimate for an annulled F24 and suspends incompatible monthly assumptions", () => {
    const s = emptyForecastSources();
    s.vatDocuments = [
      {
        date: "2026-09-01",
        vat: 1000,
        kind: "vendita",
        origin: "nativa",
        credit: false,
      },
    ];
    s.vatF24 = [
      { anno: 2026, mese: 9, tributo_code: "6009", stato: "annullato" },
    ];
    expect(vatEstimates(s, "2026-10-01").movements).toHaveLength(1);
    s.vatF24[0].stato = "da_pagare";
    expect(vatEstimates(s, "2026-10-01").movements).toHaveLength(0);
    s.vatF24 = [{ anno: 2026, mese: 10, tributo_code: "6009" }];
    expect(vatEstimates(s, "2026-10-01").warnings.join(" ")).toMatch(
      /non sono coerenti/,
    );
    s.vatF24 = [{ anno: 2026, mese: 9, tributo_code: "6033" }];
    expect(vatEstimates(s, "2026-10-01").warnings.join(" ")).toMatch(
      /trimestrali/,
    );
  });
  it("applies a bonus forecast once when the job comes from the linked invoice and never reduces a recorded receipt again", () => {
    const s = emptyForecastSources();
    s.orders = [{ id: "o", has_building_bonus: true }];
    s.invoices = [
      {
        id: "i",
        total: 11000,
        paid_amount: 0,
        due_date: "2026-10-14",
        status: "sent",
        order_id: "o",
      },
    ];
    s.deadlines = [
      {
        id: "d",
        description: "Fattura",
        amount: 11000,
        paid_amount: 0,
        due_date: "2026-10-14",
        direction: "entrata",
        status: "da_pagare",
        invoice_id: "i",
      },
    ];
    s.notes = [
      {
        id: "n",
        direction: "entrata",
        amount: 10008.2,
        entry_date: "2026-10-13",
      },
    ];
    const ledger = buildForecastLedger(s, "2026-10-14", 1 - 0.11 / 1.22);
    expect(ledger.movements[0]).toMatchObject({
      cents: 1000820,
      grossCents: 1100000,
    });
    expect(ledger.movements[0].note).toMatch(
      /non ritenuta effettivamente subita/,
    );
    expect(ledger.collected[0].cents).toBe(1000820);
  });
});
