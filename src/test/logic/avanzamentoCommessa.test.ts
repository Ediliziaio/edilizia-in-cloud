// src/test/logic/avanzamentoCommessa.test.ts
import { describe, expect, it } from "vitest";
import { avanzamentoDaMostrare, PESI_MEDIA, pesoMediaValido } from "@/lib/orders/avanzamentoCommessa";

describe("avanzamentoDaMostrare", () => {
  it("con «alla pari» resta il calcolo locale (con i decimali), anche se il database dice altro", () => {
    expect(avanzamentoDaMostrare(33.33, { percentuale: 33, peso: "uguale" })).toBe(33.33);
    expect(avanzamentoDaMostrare(null, { percentuale: 40, peso: "uguale" })).toBeNull();
  });
  it("con un altro peso vale il numero del database", () => {
    expect(avanzamentoDaMostrare(50, { percentuale: 30, peso: "durata" })).toBe(30);
    expect(avanzamentoDaMostrare(50, { percentuale: 7, peso: "venduto" })).toBe(7);
  });
  it("con un altro peso ma senza il numero del database: il calcolo locale", () => {
    expect(avanzamentoDaMostrare(50, { percentuale: null, peso: "durata" })).toBe(50);
  });
});

describe("PESI_MEDIA e pesoMediaValido", () => {
  it("le tre scelte, con «alla pari» per prima", () => {
    expect(PESI_MEDIA.map((p) => p.valore)).toEqual(["uguale", "durata", "venduto"]);
  });
  it("un valore sconosciuto vale «alla pari»", () => {
    expect(pesoMediaValido("venduto")).toBe("venduto");
    expect(pesoMediaValido("durata")).toBe("durata");
    expect(pesoMediaValido("boh")).toBe("uguale");
    expect(pesoMediaValido(undefined)).toBe("uguale");
  });
});
