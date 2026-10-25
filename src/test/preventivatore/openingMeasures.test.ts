import { describe, expect, it } from "vitest";
import { quoteOpeningMeasures, quoteOpeningMeasureText } from "@/lib/preventivi/quoteOpeningMeasures";
describe("Superfici serramenti: aritmetica locale su gruppi espliciti", () => {
  it("2 finestre120x140 =3.36m², non2.40; distingue gli altri gruppi e le portefinestre", () => {
    const groups = quoteOpeningMeasures("2 finestre da 120 × 140 cm, altre 2 finestre da 80 × 120 cm e 1 portafinestra da 100 × 240 cm");
    expect(groups.map(g => g.areaTotalM2)).toEqual([3.36, 1.92, 2.4]);
    expect(quoteOpeningMeasureText(groups)).toContain("7,68 m²"); expect(quoteOpeningMeasureText(groups)).toContain("Non è una conferma di rilievo");
  });
  it("gestisce metri decimali e millimetri, senza arrotondare per eccesso o inventare pezzi", () => {
    expect(quoteOpeningMeasures("2 finestre da 1,2 x 1,4 m")[0].areaTotalM2).toBe(3.36);
    expect(quoteOpeningMeasures("2 finestre da 1200 × 1400 mm")[0].areaTotalM2).toBe(3.36);
    expect(quoteOpeningMeasures("Finestre 120×140, forse quattro")).toEqual([]);
    expect(quoteOpeningMeasures("2 finestre da 120×140")).toEqual([]);
  });
  it.each(["0 finestre da120x140cm", "2 finestre da 0 x 140 cm", "999 finestre da 120 x 140 cm", "2 finestre da 120 x 140 m"])("rifiuta gruppi fuori limiti: %s", text => { expect(quoteOpeningMeasures(text)).toEqual([]); });
});
