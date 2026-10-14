import { describe, expect, it } from "vitest";
import { dipendentePerCostoLavorazione } from "@/lib/tariffe/costoDipendente";

describe("Costo del dipendente nel listino manodopera", () => {
  it("usa il costo calcolabile dell'anagrafica quando manca la tariffa manuale", () => {
    const d = dipendentePerCostoLavorazione({
      id: "d1",
      first_name: "Operatore",
      last_name: "Demo",
      costo_orario: null,
      gross_salary: 2000,
      monthly_hours: 160,
      inps_rate: 28,
    });
    expect(d).toMatchObject({ costo_orario: 16, costo_calcolato: true });
    expect(d).not.toHaveProperty("gross_salary");
    expect(d).not.toHaveProperty("inps_rate");
  });
  it("rispetta la tariffa manuale quando è impostata", () => {
    expect(
      dipendentePerCostoLavorazione({
        id: "d1",
        costo_orario: 25,
        gross_salary: 2000,
        monthly_hours: 160,
        inps_rate: 28,
      }),
    ).toMatchObject({ costo_orario: 25, costo_calcolato: false });
  });
  it("non inventa le ore contrattuali per un dipendente con dati incompleti", () => {
    expect(
      dipendentePerCostoLavorazione({
        id: "d1",
        gross_salary: 2000,
        monthly_hours: null,
        inps_rate: 28,
      }).costo_orario,
    ).toBeNull();
  });
  it("un costo manuale non valido non viene sostituito di nascosto", () => {
    expect(
      dipendentePerCostoLavorazione({
        id: "d1",
        costo_orario: -1,
        gross_salary: 2000,
        monthly_hours: 160,
        inps_rate: 28,
      }).costo_orario,
    ).toBeNull();
  });
});
