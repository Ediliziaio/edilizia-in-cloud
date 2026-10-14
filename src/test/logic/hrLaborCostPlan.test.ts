import { describe, expect, it } from "vitest";
import { calculateFullLaborCost, emptyHrCostDraft, normalizeHrCostSave, parseHrCostAmount } from "@/lib/personale/laborCostPlan";

const base = () => ({ gross: "30.000", employer: "9.000", tfr: "2.100", buildingFund: "3.000", other: "1.200", recoveries: "0", contractHours: "2080", nonProductiveHours: "320" });
describe("Costo pieno gestionale, non un secondo cedolino", () => {
  it("include TFR/oneri ma non duplica trattenute o mensilità", () => {
    expect(calculateFullLaborCost(base())).toEqual({ errors: [], annualCost: 45300, productiveHours: 1760, hourlyCost: 25.74 });
  });
  it("recuperi del periodo riducono il costo aziendale una volta sola", () => {
    expect(calculateFullLaborCost({ ...base(), recoveries: "1.300" }).annualCost).toBe(44000);
  });
  it("più ore non produttive incidono sul costo, non generano ore di cantiere", () => {
    expect(calculateFullLaborCost({ ...base(), nonProductiveHours: "480" }).hourlyCost).toBe(28.31);
  });
  it("zero oneri espliciti sono validi: nessun 28% o TFR inventato", () => {
    const r = calculateFullLaborCost({ ...base(), employer: "0", tfr: "0", buildingFund: "0", other: "0", nonProductiveHours: "0" });
    expect(r.annualCost).toBe(30000); expect(r.hourlyCost).toBe(14.42);
  });
  it("prospetto incompleto non restituisce una tariffa sottostimata", () => expect(calculateFullLaborCost(emptyHrCostDraft()).hourlyCost).toBeNull());
  it.each([{ gross: "0" }, { contractHours: "0" }, { contractHours: "9000" }, { nonProductiveHours: "2080" }, { nonProductiveHours: "3000" }, { tfr: "-50" }, { recoveries: "45300" }, { recoveries: "50000" }, { employer: "Infinity" }])("non applica valori non validi %j", patch => {
    const r = calculateFullLaborCost({ ...base(), ...patch }); expect(r.errors.length).toBeGreaterThan(0); expect(r.hourlyCost).toBeNull();
  });
  it.each(["", " ", "€", "NaN", "Infinity", "0x10", "12 euro", "12,3.4", "1,2,3", "-1", "1e20"])("parsing fiscale stretto, rifiuta %s", value => expect(parseHrCostAmount(value)).toBeNull());
  it.each([["1.234,56", 1234.56], ["1,234.56", 1234.56], ["25,50", 25.5], ["25.50", 25.5], ["€ 1.500", 1500], ["0", 0]])("interpreta %s come %s", (value, expected) => expect(parseHrCostAmount(String(value))).toBe(expected));
  it("aggiorna solo la tariffa e usa virgola canonica per numero_italiano", () => {
    expect(normalizeHrCostSave({ costo_orario: "25,555" })).toEqual({ costo_orario: "25,555" });
  });
  it("solo l'azzeramento della tariffa può usare il campo vuoto", () => {
    expect(normalizeHrCostSave({ costo_orario: "" })).toEqual({ costo_orario: "" });
    expect(() => normalizeHrCostSave({ stipendio_lordo: "" })).toThrow();
  });
  it.each(["0", "745", "7,5", "-5"])("non arrotonda o inventa ore mensili %s", ore_mese => expect(() => normalizeHrCostSave({ ore_mese })).toThrow());
  it("INPS zero rimane zero e aliquota >100 viene rifiutata", () => {
    expect(normalizeHrCostSave({ contributi_percento: "0" })).toEqual({ contributi_percento: "0" });
    expect(() => normalizeHrCostSave({ contributi_percento: "101" })).toThrow();
  });
});
