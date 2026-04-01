import { describe, it, expect } from "vitest";

/**
 * Test logica calcolo margine cantiere.
 * Replica esatta della formula usata in v_ordine_marginalita e MargineVociDetail.
 * Queste funzioni non dipendono da React o Supabase — test puri e veloci.
 */

// ─── Funzioni riprese da MargineVociDetail ────────────────────────────────────

function calcVoceRicavo(unitPrice: number | null, quantity: number): number {
  return (unitPrice ?? 0) * (quantity ?? 1);
}

function calcVoceCosto(
  purchasePrice: number | null,
  standardCost: number | null,
  quantity: number
): number {
  return (purchasePrice ?? standardCost ?? 0) * (quantity ?? 1);
}

function calcMargineVoce(
  unitPrice: number | null,
  purchasePrice: number | null,
  standardCost: number | null,
  quantity: number
): { margine: number; marginePerc: number } {
  const ricavo = calcVoceRicavo(unitPrice, quantity);
  const costo = calcVoceCosto(purchasePrice, standardCost, quantity);
  const margine = ricavo - costo;
  const marginePerc = ricavo > 0 ? (margine / ricavo) * 100 : 0;
  return { margine, marginePerc };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe("calcolo margine voce d'ordine", () => {
  it("margine positivo: prezzo vendita > prezzo acquisto", () => {
    const { margine, marginePerc } = calcMargineVoce(100, 60, null, 1);
    expect(margine).toBe(40);
    expect(marginePerc).toBeCloseTo(40, 1);
  });

  it("margine negativo: costo > ricavo (perdita)", () => {
    const { margine, marginePerc } = calcMargineVoce(50, 80, null, 1);
    expect(margine).toBe(-30);
    expect(marginePerc).toBeCloseTo(-60, 1);
  });

  it("margine zero: pareggio esatto", () => {
    const { margine, marginePerc } = calcMargineVoce(100, 100, null, 2);
    expect(margine).toBe(0);
    expect(marginePerc).toBe(0);
  });

  it("usa standard_cost quando purchase_price è null", () => {
    const { margine } = calcMargineVoce(120, null, 70, 1);
    expect(margine).toBe(50);
  });

  it("usa 0 quando sia purchase_price che standard_cost sono null (margine = 100%)", () => {
    const { margine, marginePerc } = calcMargineVoce(100, null, null, 1);
    expect(margine).toBe(100);
    expect(marginePerc).toBe(100);
  });

  it("gestisce unit_price null (voce senza prezzo)", () => {
    const { margine, marginePerc } = calcMargineVoce(null, 50, null, 1);
    expect(margine).toBe(-50);
    expect(marginePerc).toBe(0); // ricavo = 0 → 0%
  });

  it("scala correttamente con la quantità", () => {
    const { margine } = calcMargineVoce(100, 60, null, 5);
    // ricavo = 500, costo = 300, margine = 200
    expect(margine).toBe(200);
  });

  it("quantità decimale (es. 2.5 m² di piastrelle)", () => {
    const { margine } = calcMargineVoce(80, 50, null, 2.5);
    // ricavo = 200, costo = 125, margine = 75
    expect(margine).toBe(75);
  });
});

describe("soglie semaforo margine", () => {
  it("verde: margine >= 25%", () => {
    const { marginePerc } = calcMargineVoce(100, 70, null, 1);
    expect(marginePerc).toBeGreaterThanOrEqual(25);
  });

  it("giallo: margine tra 10% e 24%", () => {
    const { marginePerc } = calcMargineVoce(100, 87, null, 1);
    expect(marginePerc).toBeGreaterThanOrEqual(10);
    expect(marginePerc).toBeLessThan(25);
  });

  it("rosso: margine < 10%", () => {
    const { marginePerc } = calcMargineVoce(100, 95, null, 1);
    expect(marginePerc).toBeLessThan(10);
  });
});
