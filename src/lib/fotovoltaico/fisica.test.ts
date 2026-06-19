/**
 * Test modello fisico FV — equivalenze CO2 (F7).
 *
 * Bug: `auto_km_benzina = co2_kg × 5450` era sbagliato di ~1000× rispetto al
 * commento (0.18 kg CO2/km). I km equivalenti = kg CO2 / 0.18.
 */

import { describe, it, expect } from "vitest";
import { equivalenzeCo2 } from "./fisica";

describe("equivalenzeCo2 — km benzina (F7)", () => {
  it("calcola i km come kg CO2 / 0.18 (non ×5450)", () => {
    // 1800 kg CO2 / 0.18 = 10000 km
    expect(equivalenzeCo2(1800).auto_km_benzina).toBe(10000);
  });

  it("resta nell'ordine di grandezza fisico atteso", () => {
    // Un impianto residenziale evita ~25-40 t CO2 in 25 anni → decine/centinaia
    // di migliaia di km, NON decine di milioni (come dava il bug ×5450).
    const km = equivalenzeCo2(30000).auto_km_benzina;
    expect(km).toBeGreaterThan(100_000);
    expect(km).toBeLessThan(1_000_000);
  });
});
