import { describe, expect, it } from "vitest";
import { GRUPPI_LAVORAZIONE, gruppoLavorazione } from "@/lib/tariffe/costoLavorazione";

describe("i gruppi di lavorazioni del listino", () => {
  it("ci sono le categorie edili, senza doppioni", () => {
    const id = GRUPPI_LAVORAZIONE.map((g) => g.id);
    for (const nuova of ["sicurezza", "strutture", "murature", "coperture", "isolamenti", "serramenti", "pavimenti", "tinteggiature", "manodopera", "forniture"]) {
      expect(id).toContain(nuova);
    }
    expect(new Set(id).size).toBe(id.length);
  });
  it("una scelta salvata vale", () => {
    expect(gruppoLavorazione({ nome: "Platea", tipo: "posa", custom_field_values: { _gruppo_lavorazione: "strutture" } })).toBe("strutture");
  });
  it("le voci senza scelta restano dove stavano: niente cambia da solo", () => {
    expect(gruppoLavorazione({ nome: "Posa finestra", tipo: "posa" })).toBe("posa");
    expect(gruppoLavorazione({ nome: "Massetto", tipo: "posa" })).toBe("opere_edili");
    expect(gruppoLavorazione({ nome: "Tinteggiatura", tipo: "posa" })).toBe("finiture");
    expect(gruppoLavorazione({ nome: "Ponteggio", tipo: "ponteggio" })).toBe("noli");
  });
});
