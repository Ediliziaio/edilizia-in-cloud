import { describe, expect, it } from "vitest";
import { voceCosto } from "@/lib/costi/voceCosto";
import { buildCategoryDistribution } from "@/lib/costsUtils";

describe("voce di un costo (15/11/2026)", () => {
  it("riunisce i modi diversi di scrivere la stessa spesa", () => {
    expect(voceCosto("stipendi")).toBe("Personale");
    expect(voceCosto("Personale")).toBe("Personale");
    expect(voceCosto("subappalti")).toBe("Squadre esterne");
    expect(voceCosto("trasporti_noleggi")).toBe("Veicoli, mezzi e noleggi");
    expect(voceCosto("assicurazioni")).toBe("Assicurazioni");
    expect(voceCosto("costi_vari")).toBe("Costi vari");
    expect(voceCosto(null)).toBe("Altro");
  });
  it("nella distribuzione per categoria un solo «Altro»", () => {
    const righe = ["a", "b", "c", "d", "e", "f", "g", "h", null].map((category, i) => ({ category, amount: 100 - i }));
    const d = buildCategoryDistribution(righe);
    expect(d.filter((x) => x.name === "Altro")).toHaveLength(1);
    expect(d.reduce((s, x) => s + x.value, 0)).toBe(righe.reduce((s, r) => s + r.amount, 0));
  });
});
