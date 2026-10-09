import { describe, expect, it } from "vitest";
import { silvioVerifiedEconomics, silvioCostScenario, silvioFiniteNumber } from "../../../supabase/functions/_shared/silvioVerifiedEconomics";
const snapshot = () => ({ preventivo_contratto: 10000, variazioni_approvate: 1000, preventivo_totale: 11000,
  costo_acquisti: 2000, costo_materiali_magazzino: 500, costo_manodopera: 3500, costo_provvigioni: 0,
  costo_rimborsi_km: 100, costo_errori: 0, costo_diretto: 200, consuntivo: 6300, margine: 4700, margine_perc: 42.7,
  movimenti_magazzino_senza_costo: 0, rimborsi_km_da_approvare: 0, numero_rimborsi_km_da_approvare: 0 });

describe("Verified calculations on the official snapshot", () => {
  it("accepts numeric database strings, true zeroes and one-decimal percent", () => {
    const row = Object.fromEntries(Object.entries(snapshot()).map(([key, value]) => [key, String(value)]));
    expect(silvioVerifiedEconomics(row).actual?.margin).toBe(4700);
  });
  it.each(["materiali", "manodopera", "rimborsi_km"] as const)("simulates only the requested %s category", category => {
    const row = snapshot(); const before = structuredClone(row);
    const actual = silvioVerifiedEconomics(row).actual!;
    const expected = category === "materiali" ? 2500 : category === "manodopera" ? 3500 : 100;
    const scenario = silvioCostScenario(actual, category, true);
    expect(scenario.costo_escluso).toBe(expected);
    expect(scenario.costi_simulati).toBe(6300 - expected);
    expect(scenario.margine_simulato).toBe(4700 + expected);
    expect(scenario.parziale).toBe(true);
    expect(scenario.tipo).toContain("non margine reale");
    expect(row).toEqual(before);
    expect(actual.margin).toBe(4700);
  });
  it("never calls approved km reimbursements the complete cost of travel", () => {
    expect(silvioCostScenario(silvioVerifiedEconomics(snapshot()).actual!, "rimborsi_km", false).limite).toContain("non carburante, tempo di viaggio");
  });
  it("keeps supplier refunds/cost reversals negative instead of suppressing them", () => {
    const row = { ...snapshot(), costo_acquisti: -2000, consuntivo: 2300, margine: 8700, margine_perc: 79.1 };
    expect(silvioVerifiedEconomics(row).actual?.purchases).toBe(-2000);
  });
  it.each([null, undefined, true, false, [], {}, "", " ", "1,20", "Infinity", "0x10", Infinity, NaN, Number.MAX_SAFE_INTEGER])("rejects malformed or unsafe numeric input: %s", value => {
    expect(silvioFiniteNumber(value)).toBeNull();
  });
  it("checks all components even if aggregate fields are valid", () => {
    const row: Record<string, unknown> = snapshot(); delete row.costo_diretto;
    expect(silvioVerifiedEconomics(row).actual).toBeNull();
  });
  it("rejects silent duplicate costs", () => {
    expect(silvioVerifiedEconomics({ ...snapshot(), costo_diretto: 500 }).error).toContain("non coincidono");
  });
  it.each([-1, 0.5])("invalid completeness counts must not certify good data: %s", count => {
    expect(silvioVerifiedEconomics({ ...snapshot(), movimenti_magazzino_senza_costo: count }).actual).toBeNull();
  });
});
