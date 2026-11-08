import { describe, expect, it } from "vitest";
import { misureDelRilievo } from "../../../supabase/functions/_shared/misureSopralluogo";

const schema = (unit: string) => ({ element_types: [{ key: "infisso", sections: [{ fields: [{ key: "larghezza_foro", unit }, { key: "altezza_foro", unit }] }] }] });

describe("misure dell'infisso nel sopralluogo", () => {
  it("il foro in centimetri diventa millimetri (i rilievi veri: 120 × 140)", () => {
    expect(misureDelRilievo({ larghezza_foro: "120", altezza_foro: "140" }, schema("cm"))).toEqual({ larghezza_mm: 1200, altezza_mm: 1400 });
  });
  it("rispetta l'unità del modello e la virgola", () => {
    expect(misureDelRilievo({ larghezza_foro: 1200, altezza_foro: 1400 }, schema("mm"))).toEqual({ larghezza_mm: 1200, altezza_mm: 1400 });
    expect(misureDelRilievo({ larghezza_foro: "1,2", altezza_foro: "1,4" }, schema("m"))).toEqual({ larghezza_mm: 1200, altezza_mm: 1400 });
    expect(misureDelRilievo({ larghezza_foro: "120,5", altezza_foro: "140" }, schema("cm"))).toEqual({ larghezza_mm: 1205, altezza_mm: 1400 });
  });
  it("senza modello il foro è in centimetri, come nel modello standard", () => {
    expect(misureDelRilievo({ larghezza_foro: 90, altezza_foro: 140 }, null)).toEqual({ larghezza_mm: 900, altezza_mm: 1400 });
  });
  it("i campi vecchi restano in millimetri", () => {
    expect(misureDelRilievo({ larghezza_mm: 1000, altezza_mm: 1100 }, null)).toEqual({ larghezza_mm: 1000, altezza_mm: 1100 });
    expect(misureDelRilievo({ larghezza: 800, altezza: 900 }, null)).toEqual({ larghezza_mm: 800, altezza_mm: 900 });
  });
  it("non mescola le coppie: il foro vince sulla misura generica", () => {
    expect(misureDelRilievo({ larghezza_foro: 120, altezza_foro: 140, larghezza: 999, altezza: 999 }, schema("cm"))).toEqual({ larghezza_mm: 1200, altezza_mm: 1400 });
  });
  it("rilievo vuoto: nessuna misura", () => {
    expect(misureDelRilievo({}, schema("cm"))).toEqual({ larghezza_mm: null, altezza_mm: null });
    expect(misureDelRilievo(null, null)).toEqual({ larghezza_mm: null, altezza_mm: null });
    expect(misureDelRilievo({ larghezza_foro: "0", altezza_foro: "" }, schema("cm"))).toEqual({ larghezza_mm: null, altezza_mm: null });
  });
});
