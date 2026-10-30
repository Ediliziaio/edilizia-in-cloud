/**
 * Le date del POS sono giorni italiani: toISOString() è in UTC e tra la mezzanotte e l'una (le due d'estate)
 * restituisce ieri. Il 30/10/2026 la revisione 0 e la validità di un POS creato alle 00:30 portavano il giorno prima.
 */
import { describe, expect, it } from "vitest";
import { dataRomaDaIso, oggiRoma } from "../../../supabase/functions/_shared/posData";

describe("data di oggi in Italia", () => {
  it("dopo la mezzanotte italiana è già il giorno dopo, anche se in UTC è ancora ieri", () => {
    expect(oggiRoma(new Date("2026-10-30T23:30:00Z"))).toBe("2026-10-31"); // ora solare: 00:30 del 31
    expect(oggiRoma(new Date("2026-07-15T22:30:00Z"))).toBe("2026-07-16"); // ora legale: 00:30 del 16
    expect(new Date("2026-10-30T23:30:00Z").toISOString().slice(0, 10)).toBe("2026-10-30"); // quello che c'era prima
  });
  it("di giorno coincide con la data UTC; nel cambio d'ora non sbaglia", () => {
    expect(oggiRoma(new Date("2026-10-30T10:00:00Z"))).toBe("2026-10-30");
    expect(oggiRoma(new Date("2026-03-29T00:30:00Z"))).toBe("2026-03-29"); // notte del passaggio all'ora legale
    expect(oggiRoma(new Date("2026-10-24T22:30:00Z"))).toBe("2026-10-25"); // ancora ora legale: già domenica
  });
  it("un istante con fuso si scrive col giorno italiano; una data semplice resta com'è", () => {
    expect(dataRomaDaIso("2026-10-30T23:30:00Z")).toBe("31/10/2026");
    expect(dataRomaDaIso("2026-10-30T12:00:00+00:00")).toBe("30/10/2026");
    expect(dataRomaDaIso("2026-11-09")).toBe("09/11/2026");
    expect(dataRomaDaIso("")).toBe("");
    expect(dataRomaDaIso(null)).toBe("");
    expect(dataRomaDaIso("boh")).toBe("boh");
  });
});
