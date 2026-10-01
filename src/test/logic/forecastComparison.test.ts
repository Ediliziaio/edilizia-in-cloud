import { describe, expect, it } from "vitest";
import { compareMaterialCommitments, compareSnapshots, estimateCostAtCompletion, type MeasureSnapshot } from "@/lib/orders/forecastComparison";

const snapshot = (patch: Partial<MeasureSnapshot> = {}): MeasureSnapshot => ({
  context: { companyId: "c1", orderId: "o1", scopeVersion: "scope1", unit: "EUR", basis: "net_cost" },
  version: "v1", asOf: "2026-10-01", value: 100, completeness: "complete", ...patch,
});
describe("confronto previsionale e consuntivo comparabili", () => {
  it("confronta costi alla stessa data e perimetro", () => expect(compareSnapshots(snapshot(), snapshot({ value: 125 }), "to_date")).toEqual({ status: "comparable", delta: 25, percentage: 25 }));
  it.each(["companyId", "orderId", "scopeVersion", "unit", "basis"] as const)("rifiuta mismatch %s", key => {
    const observed = snapshot(); observed.context = { ...observed.context, [key]: key === "basis" ? "gross_cash" : "different" };
    expect(compareSnapshots(snapshot(), observed, "to_date").status).toBe("not_comparable");
  });
  it("non misura risparmio contro il budget totale con un consuntivo parziale", () => expect(compareSnapshots(snapshot(), snapshot({ value: 20, completeness: "partial" }), "at_completion").status).toBe("incomplete"));
  it("zero è un valore e non un dato mancante; rapporto percentuale indefinito", () => expect(compareSnapshots(snapshot({ value: 0 }), snapshot({ value: 10 }), "to_date")).toEqual({ status: "comparable", delta: 10, percentage: null }));
  it.each([null, NaN, Infinity])("gestisce valori invalidi/mancanti %s", value => {
    if (value == null) expect(compareSnapshots(snapshot(), snapshot({ value }), "to_date").status).toBe("incomplete");
    else expect(() => compareSnapshots(snapshot(), snapshot({ value }), "to_date")).toThrow();
  });
  it("non confronta periodi diversi alla data", () => expect(compareSnapshots(snapshot(), snapshot({ asOf: "2026-10-02" }), "to_date").status).toBe("not_comparable"));
  it("confronta finale con forecast precedente, senza informazioni future", () => {
    expect(compareSnapshots(snapshot(), snapshot({ asOf: "2026-10-20", value: 110 }), "at_completion").delta).toBe(10);
    expect(compareSnapshots(snapshot({ asOf: "2026-10-20" }), snapshot(), "at_completion").status).toBe("not_comparable");
  });
  it("le date si confrontano in giorni e non in percentuale", () => {
    const a = snapshot(); a.context = { ...a.context, basis: "civil_date", unit: "days" };
    expect(compareSnapshots(a, { ...a, value: 102 }, "at_completion")).toEqual({ status: "comparable", delta: 2, percentage: null });
  });
});
describe("costo finale bottom-up", () => {
  it("somma maturato e residui, senza scalarli per avanzamento fisico", () => expect(estimateCostAtCompletion({ actualAccrued: 200, remainingCommitted: 300, remainingUncommitted: 400, incrementalRisk: 100, approvedRevenue: 1500 })).toEqual({ status: "complete", finalCost: 1000, remainingCost: 800, margin: 500, marginPercent: 500 / 1500 * 100 }));
  it("sola manodopera con forniture non applicabili esplicitamente a zero", () => expect(estimateCostAtCompletion({ actualAccrued: 500, remainingCommitted: 0, remainingUncommitted: 400, incrementalRisk: 0, approvedRevenue: 1200 }).finalCost).toBe(900));
  it("residuo sconosciuto non diventa zero", () => expect(estimateCostAtCompletion({ actualAccrued: 200, remainingCommitted: 300, remainingUncommitted: null, incrementalRisk: 0, approvedRevenue: 1500 }).status).toBe("incomplete"));
  it("ricavo mancante permette il costo ma non inventa margine", () => expect(estimateCostAtCompletion({ actualAccrued: 0, remainingCommitted: 0, remainingUncommitted: 0, incrementalRisk: 0, approvedRevenue: null }).margin).toBeNull());
  it("non inventa percentuale con ricavo zero", () => expect(estimateCostAtCompletion({ actualAccrued: 1, remainingCommitted: 0, remainingUncommitted: 0, incrementalRisk: 0, approvedRevenue: 0 }).marginPercent).toBeNull());
  it("rifiuta residui negativi", () => expect(() => estimateCostAtCompletion({ actualAccrued: 0, remainingCommitted: -1, remainingUncommitted: 0, incrementalRisk: 0, approvedRevenue: 10 })).toThrow());
  it("non restituisce Infinity da somme fuori intervallo", () => expect(() => estimateCostAtCompletion({ actualAccrued: 1e308, remainingCommitted: 1e308, remainingUncommitted: 0, incrementalRisk: 0, approvedRevenue: 10 })).toThrow());
});
describe("acquisti impegnati: basi IVA omogenee", () => {
  it("122 lordo al 22% e OdA 90 netto danno -10; nessuna variante ricavo nel costo", () => expect(compareMaterialCommitments([{ purchase_price: 122, quantity: 1, vat_rate: 22 }], [{ subtotal: 90 }])).toEqual({ planned: 100, committed: 90, gap: -10, percentage: -10 }));
  it("IVA mista è scorporata articolo per articolo", () => expect(compareMaterialCommitments([{ purchase_price: 110, quantity: 1, vat_rate: 10 }, { purchase_price: 122, quantity: 1, vat_rate: 22 }], [{ subtotal: 200 }]).gap).toBe(0));
  it.each([{ purchase_price: null, quantity: 1, vat_rate: 22 }, { purchase_price: 100, quantity: 1, vat_rate: null }, { purchase_price: 100, quantity: -1, vat_rate: 22 }])("incompleto non produce scostamento %j", item => expect(compareMaterialCommitments([item], [{ subtotal: 0 }]).gap).toBeNull());
  it("costi documentati mancanti non diventano zero", () => expect(compareMaterialCommitments([], [{ subtotal: null }]).committed).toBeNull());
});
