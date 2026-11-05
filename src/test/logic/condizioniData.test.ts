/**
 * Condizioni sulle date nelle automazioni (25/09/2026): «l'appuntamento è da
 * oggi in poi?», con il giorno letto a Roma.
 */
import { describe, expect, it } from "vitest";
import { confrontoConOggi, giornoRoma, oggiRoma } from "../../../supabase/functions/_shared/condizioniData";

// Venerdì 25 settembre 2026, 14:30 a Roma.
const ORA = new Date("2026-09-25T12:30:00Z");

describe("giornoRoma", () => {
  it("una data pura vale per quello che dice", () => {
    expect(giornoRoma("2026-09-25")).toBe("2026-09-25");
  });
  it("un istante si porta sull'ora italiana", () => {
    expect(giornoRoma("2026-09-25T22:30:00Z")).toBe("2026-09-26");
    expect(giornoRoma("2026-09-25T21:59:00+00:00")).toBe("2026-09-25");
  });
  it("quello che non è una data resta null", () => {
    expect(giornoRoma(null)).toBeNull();
    expect(giornoRoma("")).toBeNull();
    expect(giornoRoma("confermato")).toBeNull();
  });
  it("oggi, a Roma", () => {
    expect(oggiRoma(new Date("2026-09-25T22:30:00Z"))).toBe("2026-09-26");
  });
});

describe("confrontoConOggi", () => {
  it("la demo di oggi pomeriggio e quella di lunedì sono «da oggi in poi»", () => {
    expect(confrontoConOggi("2026-09-25", "da_oggi", ORA)).toBe(true);
    expect(confrontoConOggi("2026-09-28", "da_oggi", ORA)).toBe(true);
    expect(confrontoConOggi("2026-09-25", "prima_di_oggi", ORA)).toBe(false);
  });
  it("una demo di giugno è passata, anche se è rimasta «confermata»", () => {
    expect(confrontoConOggi("2026-06-10", "da_oggi", ORA)).toBe(false);
    expect(confrontoConOggi("2026-06-10", "prima_di_oggi", ORA)).toBe(true);
  });
  it("senza appuntamento nessuno dei due è vero", () => {
    expect(confrontoConOggi(undefined, "da_oggi", ORA)).toBe(false);
    expect(confrontoConOggi(undefined, "prima_di_oggi", ORA)).toBe(false);
  });
});

describe("oggi e domani", () => {
  // Venerdì 25 settembre 2026, 14:30 a Roma.
  it("«oggi» è solo il giorno di oggi, a Roma", () => {
    expect(confrontoConOggi("2026-09-25", "oggi", ORA)).toBe(true);
    expect(confrontoConOggi("2026-09-26", "oggi", ORA)).toBe(false);
    expect(confrontoConOggi("2026-09-24", "oggi", ORA)).toBe(false);
  });
  it("«domani» è il giorno dopo sul calendario, non fra 24 ore", () => {
    expect(confrontoConOggi("2026-09-26", "domani", ORA)).toBe(true);
    expect(confrontoConOggi("2026-09-25", "domani", ORA)).toBe(false);
    expect(confrontoConOggi("2026-09-27", "domani", ORA)).toBe(false);
  });
  it("a fine mese e a fine anno «domani» cambia mese e anno", () => {
    expect(confrontoConOggi("2026-10-01", "domani", new Date("2026-09-30T10:00:00Z"))).toBe(true);
    expect(confrontoConOggi("2027-01-01", "domani", new Date("2026-12-31T10:00:00Z"))).toBe(true);
  });
  it("alle 23:30 di Roma «domani» è già il giorno dopo di Roma, non di UTC", () => {
    // 30 settembre, 23:30 a Roma = 21:30 UTC.
    expect(confrontoConOggi("2026-10-01", "domani", new Date("2026-09-30T21:30:00Z"))).toBe(true);
    // 1 ottobre, 00:30 a Roma = 30 settembre 22:30 UTC: domani è il 2.
    expect(confrontoConOggi("2026-10-02", "domani", new Date("2026-09-30T22:30:00Z"))).toBe(true);
  });
  it("il caso del promemoria: appuntamento preso oggi per oggi non è «domani»", () => {
    expect(confrontoConOggi("2026-09-25", "domani", ORA)).toBe(false);
  });
  it("un valore che non è una data non è né oggi né domani", () => {
    expect(confrontoConOggi(undefined, "oggi", ORA)).toBe(false);
    expect(confrontoConOggi("telefonata", "domani", ORA)).toBe(false);
  });
});
