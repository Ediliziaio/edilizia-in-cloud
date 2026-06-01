import { describe, it, expect } from "vitest";
import {
  roundPrice,
  adjustValue,
  computeAdjustedPrices,
  marginePerc,
  type PriceAdjustOptions,
} from "@/lib/tariffe/priceAdjust";

const opts = (o: Partial<PriceAdjustOptions>): PriceAdjustOptions => ({
  target: "vendita",
  mode: "percent",
  amount: 0,
  round: "none",
  ...o,
});

describe("roundPrice", () => {
  it("arrotonda a 2 decimali di default (none)", () => {
    expect(roundPrice(21.989, "none")).toBe(21.99);
    expect(roundPrice(10.005, "none")).toBe(10.01);
    expect(roundPrice(10, "none")).toBe(10);
  });

  it("arrotonda a 0,50", () => {
    expect(roundPrice(21.989, "0.50")).toBe(22);
    expect(roundPrice(21.2, "0.50")).toBe(21);
    expect(roundPrice(21.3, "0.50")).toBe(21.5);
    expect(roundPrice(21.75, "0.50")).toBe(22);
  });

  it("arrotonda all'intero", () => {
    expect(roundPrice(21.4, "1")).toBe(21);
    expect(roundPrice(21.5, "1")).toBe(22);
  });

  it("valori non finiti → 0", () => {
    expect(roundPrice(Number.NaN, "none")).toBe(0);
    expect(roundPrice(Number.POSITIVE_INFINITY, "none")).toBe(0);
  });
});

describe("adjustValue", () => {
  it("percentuale positiva", () => {
    expect(adjustValue(100, opts({ mode: "percent", amount: 5 }))).toBe(105);
    expect(adjustValue(19.99, opts({ mode: "percent", amount: 10 }))).toBe(21.99);
  });

  it("percentuale negativa", () => {
    expect(adjustValue(100, opts({ mode: "percent", amount: -3 }))).toBe(97);
  });

  it("importo fisso con segno", () => {
    expect(adjustValue(100, opts({ mode: "fixed", amount: 2.5 }))).toBe(102.5);
    expect(adjustValue(100, opts({ mode: "fixed", amount: -10 }))).toBe(90);
  });

  it("clamp a 0 quando il risultato sarebbe negativo", () => {
    expect(adjustValue(50, opts({ mode: "fixed", amount: -100 }))).toBe(0);
    expect(adjustValue(50, opts({ mode: "percent", amount: -150 }))).toBe(0);
  });

  it("null/undefined/non-finito → null", () => {
    expect(adjustValue(null, opts({ amount: 5 }))).toBeNull();
    expect(adjustValue(undefined, opts({ amount: 5 }))).toBeNull();
    expect(adjustValue(Number.NaN, opts({ amount: 5 }))).toBeNull();
  });

  it("applica l'arrotondamento richiesto", () => {
    expect(adjustValue(100, opts({ mode: "percent", amount: 3, round: "0.50" }))).toBe(103);
    expect(adjustValue(101, opts({ mode: "percent", amount: 3, round: "1" }))).toBe(104);
  });
});

describe("computeAdjustedPrices", () => {
  const t = { prezzo_vendita: 100, costo_interno: 60, prezzo_costo: 60 };

  it("target vendita: tocca solo la vendita", () => {
    const r = computeAdjustedPrices(t, opts({ target: "vendita", amount: 10 }));
    expect(r.prezzo_vendita).toBe(110);
    expect(r.costo_interno).toBe(60);
    expect(r.changedVendita).toBe(true);
    expect(r.changedCosto).toBe(false);
  });

  it("target costo: tocca solo il costo", () => {
    const r = computeAdjustedPrices(t, opts({ target: "costo", amount: 10 }));
    expect(r.prezzo_vendita).toBe(100);
    expect(r.costo_interno).toBe(66);
    expect(r.changedVendita).toBe(false);
    expect(r.changedCosto).toBe(true);
  });

  it("target entrambi: tocca vendita e costo", () => {
    const r = computeAdjustedPrices(t, opts({ target: "entrambi", amount: 10 }));
    expect(r.prezzo_vendita).toBe(110);
    expect(r.costo_interno).toBe(66);
    expect(r.changedVendita).toBe(true);
    expect(r.changedCosto).toBe(true);
  });

  it("amount 0 → nessuna modifica effettiva", () => {
    const r = computeAdjustedPrices(t, opts({ target: "entrambi", amount: 0 }));
    expect(r.changedVendita).toBe(false);
    expect(r.changedCosto).toBe(false);
  });

  it("usa il legacy prezzo_costo quando costo_interno è assente", () => {
    const r = computeAdjustedPrices(
      { prezzo_vendita: 100, prezzo_costo: 50 },
      opts({ target: "costo", amount: 20 }),
    );
    expect(r.costo_interno).toBe(60);
    expect(r.changedCosto).toBe(true);
  });

  it("valori mancanti restano null e non risultano cambiati", () => {
    const r = computeAdjustedPrices(
      { prezzo_vendita: undefined, costo_interno: null },
      opts({ target: "entrambi", amount: 10 }),
    );
    expect(r.prezzo_vendita).toBeNull();
    expect(r.costo_interno).toBeNull();
    expect(r.changedVendita).toBe(false);
    expect(r.changedCosto).toBe(false);
  });
});

describe("marginePerc", () => {
  it("calcola il margine sul prezzo di vendita", () => {
    expect(marginePerc(100, 60)).toBeCloseTo(40, 5);
    expect(marginePerc(125, 100)).toBeCloseTo(20, 5);
  });

  it("margine negativo se sottocosto", () => {
    expect(marginePerc(80, 100)).toBeCloseTo(-25, 5);
  });

  it("null se vendita assente/zero o costo assente", () => {
    expect(marginePerc(null, 60)).toBeNull();
    expect(marginePerc(0, 60)).toBeNull();
    expect(marginePerc(100, null)).toBeNull();
  });
});
