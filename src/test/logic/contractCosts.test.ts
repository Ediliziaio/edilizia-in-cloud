import { describe, expect, it } from "vitest";
import { consolidateContractCosts, type ContractCostSnapshot } from "@/lib/orders/contractCosts";

export function costSnapshot(): ContractCostSnapshot {
  return { company_id: "company", contract_id: "root", calculated_at: "2026-10-16T12:00:00Z", lines: [
    { id: "root", order_code: "C-1", description: "Contratto", intervention_reference: null, is_contract: true,
      economics: { preventivo_totale: 1000, consuntivo: 50, costo_diretto: 50 } },
    { id: "a", order_code: "INT-A", description: "Intervento A", intervention_reference: "PED-A", is_contract: false,
      economics: { preventivo_totale: 9999, consuntivo: 300, costo_acquisti: 200, costo_manodopera: 100 } },
    { id: "b", order_code: "INT-B", description: "Intervento B", intervention_reference: "PED-B", is_contract: false,
      economics: { consuntivo: 125, costo_materiali_magazzino: 75, costo_errori: 50,
        movimenti_magazzino_senza_costo: 2, numero_rimborsi_km_da_approvare: 1 } },
  ] };
}
describe("consolidamento costi senza registrazioni duplicate", () => {
  it("somma contratto e due interventi una sola volta, con ricavo del solo contratto", () => {
    const source = costSnapshot(); const before = structuredClone(source);
    const result = consolidateContractCosts(source, "company", "root");
    expect(result.interventionCosts).toBe(425); expect(result.costs).toBe(475);
    expect(result.revenue).toBe(1000); expect(result.margin).toBe(525);
    expect(result.categories.reduce((sum, category) => sum + category.amount, 0)).toBe(475);
    expect(source).toEqual(before); // No copied costs/revenue written onto root.
    expect(consolidateContractCosts(source, "company", "root").costs).toBe(475);
  });
  it("le correzioni, eliminazioni e riassegnazioni sostituiscono il valore precedente", () => {
    const source = costSnapshot(); source.lines[1].economics!.consuntivo = 80;
    expect(consolidateContractCosts(source, "company", "root").costs).toBe(255);
    source.lines.splice(1, 1);
    expect(consolidateContractCosts(source, "company", "root").costs).toBe(175);
  });
  it("non usa un totale parziale se manca una fonte o compare due volte un intervento", () => {
    const missing = costSnapshot(); missing.lines[1].economics = null;
    expect(() => consolidateContractCosts(missing, "company", "root")).toThrow(/incompleti/);
    const duplicate = costSnapshot(); duplicate.lines.push(duplicate.lines[1]);
    expect(() => consolidateContractCosts(duplicate, "company", "root")).toThrow(/ripetuti/);
  });
  it("rifiuta azienda o contratto diversi e radici assenti o duplicate", () => {
    expect(() => consolidateContractCosts(costSnapshot(), "other", "root")).toThrow();
    expect(() => consolidateContractCosts(costSnapshot(), "company", "other")).toThrow();
    const source = costSnapshot(); source.lines.shift();
    expect(() => consolidateContractCosts(source, "company", "root")).toThrow();
  });
  it("un contratto ancora senza ricavi conserva costi e dati mancanti senza inventare margini", () => {
    const source = costSnapshot(); source.lines[0].economics!.preventivo_totale = null;
    const result = consolidateContractCosts(source, "company", "root");
    expect(result.costs).toBe(475); expect(result.margin).toBeNull();
    expect(result.missingWarehouseCosts).toBe(2); expect(result.pendingMileage).toBe(1);
  });
});
