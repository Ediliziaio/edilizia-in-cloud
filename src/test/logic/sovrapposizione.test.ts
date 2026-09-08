import { describe, it, expect } from "vitest";
import { intervalloCommessa, siSovrappongono } from "@/lib/calendar/sovrapposizione";

describe("intervalloCommessa", () => {
  it("con orari usa le ore", () => {
    const i = intervalloCommessa({ work_start_date: "2026-09-14", work_end_date: "2026-09-14", work_start_time: "08:00", work_end_time: "12:00" })!;
    expect(i.inizio.toISOString()).toBe(new Date("2026-09-14T08:00:00").toISOString());
    expect(i.fine.toISOString()).toBe(new Date("2026-09-14T12:00:00").toISOString());
  });
  it("senza orari copre tutta la giornata, fino alla fine lavori", () => {
    const i = intervalloCommessa({ work_start_date: "2026-09-14", work_end_date: "2026-09-16", work_start_time: null, work_end_time: null })!;
    expect(i.inizio.toISOString()).toBe(new Date("2026-09-14T00:00:00").toISOString());
    expect(i.fine.toISOString()).toBe(new Date("2026-09-16T23:59:00").toISOString());
  });
  it("senza data non c'è intervallo", () => {
    expect(intervalloCommessa({ work_start_date: null, work_end_date: null, work_start_time: null, work_end_time: null })).toBeNull();
  });
});

describe("siSovrappongono", () => {
  const g = (d: string, h: string) => new Date(`${d}T${h}:00`);
  it("due mezze giornate non si pestano", () => {
    expect(siSovrappongono({ inizio: g("2026-09-14", "08:00"), fine: g("2026-09-14", "12:00") }, { inizio: g("2026-09-14", "13:00"), fine: g("2026-09-14", "17:00") })).toBe(false);
  });
  it("mattina contro 10–14 sì", () => {
    expect(siSovrappongono({ inizio: g("2026-09-14", "08:00"), fine: g("2026-09-14", "12:00") }, { inizio: g("2026-09-14", "10:00"), fine: g("2026-09-14", "14:00") })).toBe(true);
  });
  it("tutto il giorno contro la mattina sì, contro il giorno dopo no", () => {
    const giorno = { inizio: g("2026-09-14", "00:00"), fine: g("2026-09-14", "23:59") };
    expect(siSovrappongono(giorno, { inizio: g("2026-09-14", "08:00"), fine: g("2026-09-14", "12:00") })).toBe(true);
    expect(siSovrappongono(giorno, { inizio: g("2026-09-15", "08:00"), fine: g("2026-09-15", "12:00") })).toBe(false);
  });
});
