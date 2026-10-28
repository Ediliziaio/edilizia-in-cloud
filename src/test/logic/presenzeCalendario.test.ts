import { describe, expect, it } from "vitest";
import {
  filtraPresenze,
  giorniMese,
  meseValido,
  orePresenze,
  riepilogoPresenze,
  spostaMese,
  statoPresenzaHr,
  STATI_PRESENZA,
} from "@/lib/personale/presenze";
import type { GiornataWithProfilo } from "@/hooks/useGiornate";
const row = (id: string, stato: string, extra = {}): GiornataWithProfilo =>
  ({
    id,
    profilo_id: id,
    profilo_nome: "Mario",
    profilo_cognome: "Rossi",
    profilo_mansione: "Operaio",
    profilo_reparto: "Cantiere",
    stato,
    ore_lavorate: 7.5,
    anomalia: false,
    ...extra,
  }) as GiornataWithProfilo;
describe("calendario presenze", () => {
  it("validates months before constructing ranges", () => {
    expect(meseValido("2026-10")).toBe(true);
    for (const value of ["2026-00", "2026-13", "2026-1", "wrong", "0000-01"])
      expect(meseValido(value)).toBe(false);
  });
  it("moves between years and handles leap February", () => {
    expect(spostaMese("2026-12", 1)).toBe("2027-01");
    expect(spostaMese("2026-01", -1)).toBe("2025-12");
    expect(giorniMese("2024-02").filter(Boolean)).toHaveLength(29);
    expect(giorniMese("2026-02").filter(Boolean)).toHaveLength(28);
  });
  it("uses Monday-first cells and complete weeks", () => {
    const days = giorniMese("2026-10");
    expect(days.slice(0, 4)).toEqual([null, null, null, "2026-10-01"]);
    expect(days.length % 7).toBe(0);
    expect(days.filter(Boolean)).toHaveLength(31);
  });
  it("names all HR states rather than showing question marks", () => {
    for (const key of [
      "presente",
      "assente",
      "ferie",
      "permesso",
      "malattia",
      "smart_working",
      "trasferta",
      "festivita",
      "infortunio",
      "maternita",
      "paternita",
      "lutto",
      "rol",
      "non_lavorativo",
      "missione",
    ])
      expect(STATI_PRESENZA[key]?.label).toBeTruthy();
    expect(statoPresenzaHr("nuovo_stato").label).toBe("nuovo stato");
  });
  it("counts workdays across working modes, excludes weekends from absences and keeps fractions", () => {
    const rows = [
      row("1", "presente"),
      row("2", "smart_working"),
      row("3", "trasferta"),
      row("4", "missione"),
      row("5", "non_lavorativo", { ore_lavorate: 0 }),
      row("6", "ferie", { ore_lavorate: 0, anomalia: true }),
    ];
    expect(riepilogoPresenze(rows)).toEqual({
      lavorate: 4,
      assenze: 1,
      ore: 30,
      anomalie: 1,
    });
    expect(orePresenze(7.25)).toBe("7,25 h");
  });
  it("combines filters without mutating the source", () => {
    const rows = [
      row("1", "presente"),
      row("2", "ferie", {
        profilo_nome: "Anna",
        profilo_reparto: "Ufficio",
        anomalia: true,
      }),
    ];
    const original = JSON.stringify(rows);
    expect(
      filtraPresenze(rows, "ANNA", "Ufficio", "ferie", true).map((g) => g.id),
    ).toEqual(["2"]);
    expect(filtraPresenze(rows, "Anna", "Cantiere", "", false)).toEqual([]);
    expect(JSON.stringify(rows)).toBe(original);
  });
  it("does not infer absence for people without a record", () => {
    expect(riepilogoPresenze([row("unknown", "nuovo_stato")]).assenze).toBe(0);
    expect(riepilogoPresenze([])).toEqual({
      lavorate: 0,
      assenze: 0,
      ore: 0,
      anomalie: 0,
    });
    expect(
      filtraPresenze(
        [row("1", "presente", { profilo_reparto: null })],
        "",
        "Non indicato",
        "",
        false,
      ),
    ).toHaveLength(1);
  });
});
