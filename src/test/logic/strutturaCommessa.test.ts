import { describe, expect, it } from "vitest";
import {
  calculateCompanyStructureSnapshot,
  calculateOrderStructureImpact,
  isOrderActiveForStructure,
} from "@/lib/controlloGestione/strutturaCommessa";

describe("Struttura aziendale sulla commessa", () => {
  const today = "2026-09-30";

  it("riconosce i cantieri attivi da avanzamento, stato o date", () => {
    expect(isOrderActiveForStructure({ percentuale_avanzamento: 35 }, today)).toBe(true);
    expect(isOrderActiveForStructure({ percentuale_avanzamento: 0, status: "in_corso" }, today)).toBe(true);
    expect(isOrderActiveForStructure({ percentuale_avanzamento: 0, work_start_date: "2026-09-01", work_end_date: "2026-10-31" }, today)).toBe(true);
    expect(isOrderActiveForStructure({ percentuale_avanzamento: 100 }, today)).toBe(false);
    expect(isOrderActiveForStructure({ percentuale_avanzamento: 0, work_start_date: "2026-10-01" }, today)).toBe(false);
  });

  it("separa personale operativo e ufficio senza duplicare la manodopera", () => {
    const snapshot = calculateCompanyStructureSnapshot({
      fixedCosts: [
        { amount: 1200, recurrence: "monthly" },
        { amount: 1200, recurrence: "yearly" },
        { amount: 500, recurrence: "once" },
      ],
      employees: [
        { id: "operaio", gross_salary: 2000, inps_rate: 30, role_type: "operaio", area: "cantiere" },
        { id: "ufficio", gross_salary: 1500, inps_rate: 20, role_type: "staff_interno", area: "amministrazione" },
      ],
      operationalEmployeeIds: ["operaio"],
      orders: [{ percentuale_avanzamento: 25 }, { status: "in corso" }, { percentuale_avanzamento: 100 }],
      today,
    });

    expect(snapshot.fixedCostsMonthly).toBe(1300);
    expect(snapshot.officeSalariesMonthly).toBe(1800);
    expect(snapshot.directLaborSalariesMonthly).toBe(2600);
    expect(snapshot.monthlyStructure).toBe(3100);
    expect(snapshot.activeOrders).toBe(2);
    expect(snapshot.monthlyPerActiveOrder).toBe(1550);
  });

  it("stima l'incidenza fino a oggi per una commessa aperta", () => {
    const impact = calculateOrderStructureImpact({
      directMargin: 10_000,
      revenue: 40_000,
      monthlyPerActiveOrder: 1000,
      workStartDate: "2026-07-01",
      workEndDate: "2026-12-31",
      progressPercent: 60,
      today,
    });

    expect(impact.months).toBeCloseTo(2.99, 1);
    expect(impact.allocatedStructure).toBeCloseTo(2990, -1);
    expect(impact.marginAfterStructure).toBeCloseTo(7010, -1);
    expect(impact.marginAfterStructurePct).toBeCloseTo(17.5, 1);
  });

  it("ferma la struttura alla data di fine quando lo schema storico non ha l'avanzamento", () => {
    const impact = calculateOrderStructureImpact({
      directMargin: 10_000,
      revenue: 40_000,
      monthlyPerActiveOrder: 1000,
      workStartDate: "2026-01-01",
      workEndDate: "2026-03-01",
      progressPercent: null,
      today,
    });

    expect(impact.months).toBeCloseTo(1.94, 1);
    expect(impact.allocatedStructure).toBeCloseTo(1940, -1);
  });

  it("non inventa una quota quando mancano costi, cantieri o data di avvio", () => {
    expect(calculateCompanyStructureSnapshot({
      fixedCosts: [], employees: [], operationalEmployeeIds: [], orders: [], today,
    }).monthlyPerActiveOrder).toBeNull();
    expect(calculateOrderStructureImpact({
      directMargin: 1000,
      revenue: 5000,
      monthlyPerActiveOrder: 500,
      workStartDate: null,
      workEndDate: null,
      progressPercent: 20,
      today,
    }).allocatedStructure).toBeNull();
  });
});
