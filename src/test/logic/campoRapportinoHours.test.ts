import { describe, expect, it } from "vitest";
import { validateRapportinoHours } from "@/lib/campo/rapportinoHours";

describe("Contratto delle ore del rapportino", () => {
  it("distingue ore mancanti da zero esplicito per foto o note", () => {
    expect(() => validateRapportinoHours("", 0, {})).toThrow("Indica le ore");
    expect(validateRapportinoHours(0, 0, {})).toBe(0);
  });
  it("mantiene separate ore ordinarie e aggiuntive", () => {
    expect(validateRapportinoHours(7.5, 1, {})).toBe(7.5);
    expect(validateRapportinoHours(23, 1, {})).toBe(23);
  });
  it.each([-1, NaN, Infinity, 24.1])("rifiuta ore personali non valide: %s", value => {
    expect(() => validateRapportinoHours(value, 0, {})).toThrow("Controlla le ore");
  });
  it.each([-1, NaN, Infinity, 17])("rifiuta straordinario non valido: %s", value => {
    expect(() => validateRapportinoHours(8, value, {})).toThrow("Controlla le ore");
  });
  it("non inventa le ore dell'autore quando compila per una squadra", () => {
    expect(validateRapportinoHours("", 0, { a: 4, b: 3.5 })).toBe(0);
  });
  it.each(["", 0, -1, NaN, Infinity, 24.1] as const)("richiede ore valide per ogni persona selezionata: %s", value => {
    expect(() => validateRapportinoHours(0, 0, { a: 4, b: value })).toThrow("ogni persona selezionata");
  });
  it("non permette straordinario personale con ore ordinarie omesse", () => {
    expect(() => validateRapportinoHours("", 1, { a: 4 })).toThrow("ore ordinarie");
  });
  it("non modifica le presenze ricevute", () => {
    const crew = Object.freeze({ a: 4, b: 2.5 });
    validateRapportinoHours(0, 0, crew);
    expect(crew).toEqual({ a: 4, b: 2.5 });
  });
});
