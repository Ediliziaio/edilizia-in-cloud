import { describe, expect, it } from "vitest";
import { distanzaCampo, euroCampo, oreBrevi } from "@/lib/campo/numeriItaliani";

describe("Numeri dell'area campo all'italiana (collaudo 23/11)", () => {
  it("ore: niente «0.0 h» né «3.5h»", () => {
    expect(oreBrevi(0)).toBe("0h");
    expect(oreBrevi(3.5)).toBe("3h 30");
    expect(oreBrevi(8)).toBe("8h");
    expect(oreBrevi(0.25)).toBe("15 min");
    expect(oreBrevi(Number.NaN)).toBe("0h");
  });

  it("importi in euro con la virgola e il punto delle migliaia", () => {
    // In italiano il punto delle migliaia si mette da 10.000 in su: «1234,50 €» è corretto.
    expect(euroCampo(1234.5)).toMatch(/^1234,50\s€$/);
    expect(euroCampo(12345.6)).toMatch(/^12\.345,60\s€$/);
  });

  it("distanze: metri interi, km con la virgola", () => {
    expect(distanzaCampo(850)).toBe("850 m");
    expect(distanzaCampo(12345)).toBe("12,3 km");
    expect(distanzaCampo(458000)).toBe("458 km");
  });
});
