import { describe, expect, it } from "vitest";
import { confrontoComputoPiano } from "@/lib/orders/generali/confrontoComputoPiano";

describe("computo dalla pianta contro business plan", () => {
  const voci = [
    { tipo: "costo", categoria: "costruzione", importo: 300000 },
    { tipo: "costo", categoria: "costruzione", importo: 70000 },
    { tipo: "costo", categoria: "manodopera", importo: 90000 },
    { tipo: "costo", categoria: "terreno", importo: 655000 },
    { tipo: "ricavo", categoria: "vendite", importo: 365000 },
  ];
  it("conta solo opere e manodopera di cantiere", () => {
    expect(confrontoComputoPiano(522568.43, voci)).toEqual({ computo: 522568.43, piano: 460000, differenza: 62568.43, percento: 13.6 });
  });
  it("senza computo o senza opere nel piano non dice una percentuale", () => {
    expect(confrontoComputoPiano(0, voci)).toBeNull();
    expect(confrontoComputoPiano(1000, [{ tipo: "costo", categoria: "terreno", importo: 5 }])!.percento).toBeNull();
  });
});
