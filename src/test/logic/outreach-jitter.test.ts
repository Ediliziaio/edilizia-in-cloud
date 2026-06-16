import { describe, it, expect } from "vitest";
import { applyJitter } from "../../../supabase/functions/_shared/outreach-sequence";
describe("applyJitter", () => {
  const base = new Date("2026-06-15T09:00:00Z");
  it("rand=0 → invariato", () => { expect(applyJitter(base, 90, 0).getTime()).toBe(base.getTime()); });
  it("rand≈1 → vicino al max", () => { expect(applyJitter(base, 90, 0.999).getTime()).toBe(base.getTime() + 89*60000); });
  it("entro i limiti", () => { const d = applyJitter(base, 90, 0.5); expect(d.getTime()).toBeGreaterThanOrEqual(base.getTime()); expect(d.getTime()).toBeLessThanOrEqual(base.getTime()+90*60000); });

  // ── Default (3 argomenti) INVARIATO: offset al minuto tondo come il legacy ──
  it("default: offset multiplo di 60s (minuto tondo)", () => {
    for (const r of [0, 0.123, 0.5, 0.777, 0.999]) {
      const off = applyJitter(base, 90, r).getTime() - base.getTime();
      expect(off % 60000).toBe(0);
      expect(off).toBeGreaterThanOrEqual(0);
      expect(off).toBeLessThan(90 * 60000); // semi-aperto come prima
    }
  });

  // ── Opzioni "umane" (opt-in) ──
  it("stepSeconds=1 → granularità al secondo (non sempre sul minuto)", () => {
    const off = applyJitter(base, 90, 0.333, { stepSeconds: 1 }).getTime() - base.getTime();
    // 0.333 * 5400 = ~1798s → non multiplo di 60
    expect(off % 1000).toBe(0);
    expect(off % 60000).not.toBe(0);
    expect(off).toBeGreaterThanOrEqual(0);
    expect(off).toBeLessThan(90 * 60000);
  });

  it("minMinutes impone un offset minimo (no boundary del tick)", () => {
    const off0 = applyJitter(base, 90, 0, { minMinutes: 2, stepSeconds: 1 }).getTime() - base.getTime();
    expect(off0).toBe(2 * 60000); // rand=0 → esattamente il minimo
    const offMid = applyJitter(base, 90, 0.5, { minMinutes: 2, stepSeconds: 1 }).getTime() - base.getTime();
    expect(offMid).toBeGreaterThanOrEqual(2 * 60000);
    expect(offMid).toBeLessThanOrEqual(90 * 60000);
  });

  it("rimane sempre dentro [minMinutes, maxMinutes]", () => {
    for (let i = 0; i < 200; i++) {
      const off = applyJitter(base, 90, Math.random(), { minMinutes: 2, stepSeconds: 1 }).getTime() - base.getTime();
      expect(off).toBeGreaterThanOrEqual(2 * 60000);
      expect(off).toBeLessThanOrEqual(90 * 60000);
    }
  });

  it("maxMinutes=0 → invariato (nessuno scalino)", () => {
    expect(applyJitter(base, 0, 0.9, { stepSeconds: 1 }).getTime()).toBe(base.getTime());
  });
});
