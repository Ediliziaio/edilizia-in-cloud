import { describe, expect, it } from "vitest";
import { eArticoloAZero, separaArticoliAZero } from "@/lib/magazzino/articoliAZero";

const a = (id: string, extra: Record<string, unknown> = {}) => ({ id, quantity: 0, quantity_reserved: 0, min_stock_level: 0, ...extra });

describe("articoli a zero nell'elenco delle giacenze", () => {
  it("nasconde solo chi non ha giacenza, impegni, arrivi né scorta minima", () => {
    const arrivi = new Map([["arriva", { quantita: 5 }]]);
    expect(eArticoloAZero(a("vuoto"), arrivi)).toBe(true);
    expect(eArticoloAZero(a("pieno", { quantity: 3 }), arrivi)).toBe(false);
    expect(eArticoloAZero(a("impegnato", { quantity_reserved: 2 }), arrivi)).toBe(false);
    // Con la scorta minima impostata, a zero è proprio l'articolo da riordinare.
    expect(eArticoloAZero(a("da riordinare", { min_stock_level: 10 }), arrivi)).toBe(false);
    expect(eArticoloAZero(a("arriva"), arrivi)).toBe(false);
    // La giacenza arriva come testo dal database: «0.000» è zero, «0.5» no.
    expect(eArticoloAZero(a("testo", { quantity: "0.000" }))).toBe(true);
    expect(eArticoloAZero(a("mezzo", { quantity: "0.5" }))).toBe(false);
  });

  it("conta quanti ne toglie, e spento non toglie niente", () => {
    const elenco = [a("1"), a("2", { quantity: 4 }), a("3")];
    expect(separaArticoliAZero(elenco, true)).toEqual({ visibili: [elenco[1]], nascosti: 2 });
    expect(separaArticoliAZero(elenco, false)).toEqual({ visibili: elenco, nascosti: 0 });
  });
});
