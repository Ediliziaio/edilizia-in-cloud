import { describe, it, expect } from "vitest";
import { dateFilterFloor, type DateFilter } from "./useOutreachConversations";

/**
 * dateFilterFloor — confine inferiore (epoch ms) della finestra rapida sull'ultima
 * attività della conversazione. Logica pura usata dal filtro data della Posta cold.
 */
describe("dateFilterFloor", () => {
  const NOW = Date.UTC(2026, 5, 15, 12, 0, 0); // 2026-06-15T12:00:00Z (deterministico)
  const DAY = 24 * 60 * 60 * 1000;

  it("returns null for 'all' (nessun confine)", () => {
    expect(dateFilterFloor("all", NOW)).toBeNull();
  });

  it("returns now-24h for 'today'", () => {
    expect(dateFilterFloor("today", NOW)).toBe(NOW - DAY);
  });

  it("returns now-7d for '7d'", () => {
    expect(dateFilterFloor("7d", NOW)).toBe(NOW - 7 * DAY);
  });

  it("returns now-30d for '30d'", () => {
    expect(dateFilterFloor("30d", NOW)).toBe(NOW - 30 * DAY);
  });

  it("floors are strictly ordered: today > 7d > 30d", () => {
    const today = dateFilterFloor("today", NOW)!;
    const d7 = dateFilterFloor("7d", NOW)!;
    const d30 = dateFilterFloor("30d", NOW)!;
    expect(today).toBeGreaterThan(d7);
    expect(d7).toBeGreaterThan(d30);
  });

  it("una conversazione di 3 giorni fa passa '7d' ma non 'today'", () => {
    const lastAt = NOW - 3 * DAY;
    // Replica il predicato del filtro: lastAt >= floor.
    const passes = (f: DateFilter) => {
      const floor = dateFilterFloor(f, NOW);
      return floor == null ? true : lastAt >= floor;
    };
    expect(passes("today")).toBe(false);
    expect(passes("7d")).toBe(true);
    expect(passes("30d")).toBe(true);
    expect(passes("all")).toBe(true);
  });
});
