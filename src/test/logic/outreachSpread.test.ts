import { describe, it, expect } from "vitest";
import { spreadFirstTouch, pauseBetweenSendsMs } from "../../../supabase/functions/_shared/outreach-spread";

describe("spreadFirstTouch", () => {
  const start = new Date("2026-09-03T08:00:00Z");
  it("il primo parte subito, gli altri distanziati in base alla capacita' del pool", () => {
    // 660 minuti / 100 al giorno = 396 s di gap base; con rnd=0.5 il fattore e' 1.0
    const d = spreadFirstTouch({ start, count: 3, capPerDay: 100, rnd: () => 0.5 });
    expect(d[0].getTime()).toBe(start.getTime());
    expect(d[1].getTime() - d[0].getTime()).toBe(396_000);
    expect(d[2].getTime() - d[1].getTime()).toBe(396_000);
  });
  it("intervalli mai identici con rnd variabile, mai sotto il minimo", () => {
    let i = 0;
    const seq = [0, 1, 0.3];
    const d = spreadFirstTouch({ start, count: 4, capPerDay: 10_000, minGapSeconds: 90, rnd: () => seq[i++ % seq.length] });
    const gaps = d.slice(1).map((x, k) => x.getTime() - d[k].getTime());
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(90_000 * 0.6);
    expect(new Set(gaps).size).toBe(3);
  });
  it("pool senza capacita': un contatto per finestra, non un burst", () => {
    const d = spreadFirstTouch({ start, count: 2, capPerDay: 0, rnd: () => 0.5 });
    expect(d[1].getTime() - d[0].getTime()).toBe(660 * 60_000);
  });
  it("count 0 → vuoto", () => {
    expect(spreadFirstTouch({ start, count: 0, capPerDay: 5 })).toEqual([]);
  });
});

describe("pauseBetweenSendsMs", () => {
  it("resta nell'intervallo 8-25 s", () => {
    expect(pauseBetweenSendsMs(() => 0)).toBe(8_000);
    expect(pauseBetweenSendsMs(() => 1)).toBe(25_000);
    expect(pauseBetweenSendsMs(() => NaN)).toBe(16_500);
  });
});
