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
