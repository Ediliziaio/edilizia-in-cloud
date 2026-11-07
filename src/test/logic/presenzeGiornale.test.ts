import { describe, expect, it } from "vitest";
import { oreLeggibili, personeDelGiorno } from "@/lib/campo/presenzeGiornale";

describe("personeDelGiorno", () => {
  it("prende le presenze con un dipendente e somma la stessa persona in più rapportini", () => {
    const persone = personeDelGiorno([
      { id: "r1", user_id: "capo", presenze: [
        { employee_id: "e1", nome: "Mario Rossi", ore: 4 },
        { employee_id: "e2", nome: "Luca Bianchi", ore: 8 },
        { nome: "Senza anagrafica", ore: 8 },
      ] },
      { id: "r2", user_id: "capo", presenze: [{ employee_id: "e1", nome: "Mario Rossi", ore: "3.5" }] },
    ]);
    expect(persone).toEqual([
      { chiave: "dip:e2", nome: "Luca Bianchi", ore: 8, rapportiniIds: ["r1"] },
      { chiave: "dip:e1", nome: "Mario Rossi", ore: 7.5, rapportiniIds: ["r1", "r2"] },
    ]);
  });

  it("senza presenze conta l'autore con le sue ore, straordinario compreso", () => {
    expect(personeDelGiorno([{ id: "r1", user_id: "u1", ore_lavorate: "6.00", ore_straordinario: 1.5, presenze: [] }], { u1: "Anna Verdi" }))
      .toEqual([{ chiave: "utente:u1", nome: "Anna Verdi", ore: 7.5, rapportiniIds: ["r1"] }]);
  });

  it("salta i rapportini rifiutati e le ore non valide", () => {
    expect(personeDelGiorno([
      { id: "r1", user_id: "u1", stato: "rifiutato", ore_lavorate: 8 },
      { id: "r2", user_id: "u2", ore_lavorate: "abc" },
    ])).toEqual([{ chiave: "utente:u2", nome: "Senza nome", ore: 0, rapportiniIds: ["r2"] }]);
  });

  it("ore in italiano", () => {
    expect(oreLeggibili(2.5)).toBe("2,5 h");
    expect(oreLeggibili(8)).toBe("8 h");
  });
});
