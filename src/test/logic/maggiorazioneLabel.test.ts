import { describe, expect, it } from "vitest";
import { formattaMaggiorazione, suffissoMaggiorazione } from "@/lib/listino/maggiorazione";

describe("etichetta della maggiorazione di variante", () => {
  it("una maggiorazione si legge col più", () => {
    expect(formattaMaggiorazione("percentuale", 15)).toBe("+15%");
    expect(formattaMaggiorazione("fisso_mq", 40)).toBe("+40€/m²");
  });

  it("uno sconto si legge col meno, non con «+-»", () => {
    expect(formattaMaggiorazione("percentuale", -8)).toBe("−8%");
    expect(formattaMaggiorazione("fisso_pz", -25)).toBe("−25€/pz");
  });

  it("niente etichetta quando non c'è maggiorazione", () => {
    expect(formattaMaggiorazione("none", 0)).toBe("");
    expect(formattaMaggiorazione("percentuale", 0)).toBe("");
    expect(formattaMaggiorazione(null, 10)).toBe("");
    expect(suffissoMaggiorazione("none", 0)).toBe("");
  });

  it("il suffisso sta fra parentesi, con lo spazio davanti", () => {
    expect(suffissoMaggiorazione("percentuale", -8)).toBe(" (−8%)");
    expect(suffissoMaggiorazione("percentuale", 15)).toBe(" (+15%)");
  });
});
