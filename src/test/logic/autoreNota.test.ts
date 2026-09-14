/**
 * Ogni nota dice chi l'ha scritta e quando, con data e ora.
 */
import { describe, expect, it } from "vitest";
import { autoreNota, dataOraNota, firmaNota } from "@/lib/marketing/autoreNota";

describe("autoreNota", () => {
  it("nome e cognome di chi l'ha scritta", () => {
    expect(autoreNota({ first_name: "Venusia", last_name: "BeMade" })).toBe("Venusia BeMade");
  });

  it("accetta anche l'array che a volte restituisce PostgREST", () => {
    expect(autoreNota([{ first_name: "Antonella", last_name: "BeMade" }])).toBe("Antonella BeMade");
  });

  it("con il solo nome non lascia spazi in fondo", () => {
    expect(autoreNota({ first_name: "Antonella", last_name: null })).toBe("Antonella");
  });

  it("senza autore spiega perché, invece di tacere", () => {
    expect(autoreNota(null)).toBe("Importata o automatica");
    expect(autoreNota({ first_name: " ", last_name: "" })).toBe("Importata o automatica");
  });
});

describe("dataOraNota", () => {
  it("giorno, mese, anno e ora", () => {
    // Mezzogiorno UTC: in Italia è comunque lo stesso giorno, qualunque sia l'ora legale.
    const testo = dataOraNota("2026-09-14T12:00:00Z");
    expect(testo).toMatch(/^14\/09\/2026, \d{2}:00$/);
  });

  it("una data mancante o sbagliata non stampa «Invalid Date»", () => {
    expect(dataOraNota(null)).toBe("");
    expect(dataOraNota("non è una data")).toBe("");
  });
});

describe("firmaNota", () => {
  it("data e ora, poi l'autore", () => {
    expect(firmaNota("2026-09-14T12:00:00Z", { first_name: "Venusia", last_name: "BeMade" })).toMatch(
      /^14\/09\/2026, \d{2}:00 · Venusia BeMade$/,
    );
  });

  it("anche la nota importata ha la sua riga", () => {
    expect(firmaNota("2026-09-14T12:00:00Z", null)).toMatch(/· Importata o automatica$/);
  });
});
