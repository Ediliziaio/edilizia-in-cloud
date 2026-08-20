import { describe, it, expect } from "vitest";
import { calcolaAnalisi, round2 } from "@/lib/listino/analisiPrezzo";
import type { ComponenteAnalisi } from "@/lib/listino/analisiPrezzo";

const C = (
  tipo: ComponenteAnalisi["tipo"],
  quantita: number,
  prezzo: number,
): ComponenteAnalisi => ({ tipo, quantita, prezzo_unitario: prezzo });

describe("calcolaAnalisi — il caso da manuale", () => {
  // 100 € di costo diretto, SG 15%, utile 10%:
  // SG = 15 · utile = (100+15)·10% = 11,50 · prezzo = 126,50
  const r = calcolaAnalisi(
    [C("manodopera", 2, 20), C("materiale", 6, 10)],
    15,
    10,
  );

  it("compone il prezzo nell'ordine giusto (utile su costo + SG)", () => {
    expect(r.costoDiretto).toBe(100);
    expect(r.speseGenerali).toBe(15);
    expect(r.utile).toBe(11.5);
    expect(r.prezzoTotale).toBe(126.5);
  });

  it("il costo aziendale include le spese generali ma non l'utile", () => {
    expect(r.costoAziendale).toBe(115);
  });

  it("l'incidenza manodopera è sul prezzo, come la congruità", () => {
    // 40 / 126,50 = 31,62%
    expect(r.incidenzaManodoperaPct).toBe(31.62);
  });

  it("spacca il costo per tipo", () => {
    expect(r.costoManodopera).toBe(40);
    expect(r.costoMateriali).toBe(60);
    expect(r.costoNoli).toBe(0);
  });
});

describe("calcolaAnalisi — i bordi", () => {
  it("senza componenti è tutto zero, incidenza compresa (niente divisione per zero)", () => {
    const r = calcolaAnalisi([], 15, 10);
    expect(r.prezzoTotale).toBe(0);
    expect(r.incidenzaManodoperaPct).toBe(0);
  });

  it("con SG e utile a zero il prezzo è il costo diretto", () => {
    const r = calcolaAnalisi([C("materiale", 3, 7)], 0, 0);
    expect(r.prezzoTotale).toBe(21);
    expect(r.costoAziendale).toBe(21);
  });

  it("solo manodopera: incidenza sotto il 100% perché SG e utile stanno nel prezzo", () => {
    const r = calcolaAnalisi([C("manodopera", 1, 100)], 15, 10);
    // 100 / 126,50 = 79,05%
    expect(r.incidenzaManodoperaPct).toBe(79.05);
  });

  it("gli arrotondamenti avvengono alla fine, non componente per componente", () => {
    // 3 × 0,333 = 0,999 → costo 1,00 solo a fine calcolo
    const r = calcolaAnalisi(
      [C("materiale", 1, 0.333), C("materiale", 1, 0.333), C("materiale", 1, 0.333)],
      0,
      0,
    );
    expect(r.prezzoTotale).toBe(1);
  });

  it("quantità o prezzi mancanti valgono zero invece di produrre NaN", () => {
    const rotta = { tipo: "materiale", quantita: NaN, prezzo_unitario: 10 } as ComponenteAnalisi;
    const r = calcolaAnalisi([rotta, C("materiale", 2, 5)], 15, 10);
    expect(Number.isFinite(r.prezzoTotale)).toBe(true);
    expect(r.costoDiretto).toBe(10);
  });
});

describe("round2", () => {
  it("gestisce il mezzo centesimo che i float sbagliano", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
  });
});
