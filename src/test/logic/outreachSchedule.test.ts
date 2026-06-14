import { describe, it, expect } from "vitest";
import {
  isWithinSendWindow, localParts, DEFAULT_SEND_WINDOW,
} from "../../../supabase/functions/_shared/outreach-schedule";

// 2026-06-15 = lunedì (estate, CEST +2) · 2026-01-12 = lunedì (inverno, CET +1)
// 2026-06-13 = sabato · 2026-06-14 = domenica

describe("localParts — fuso Europe/Rome con DST", () => {
  it("estate = +2", () => {
    expect(localParts(new Date("2026-06-15T06:00:00Z"), "Europe/Rome")).toEqual({ hour: 8, weekday: 1 });
  });
  it("inverno = +1", () => {
    expect(localParts(new Date("2026-01-12T07:00:00Z"), "Europe/Rome")).toEqual({ hour: 8, weekday: 1 });
  });
});

describe("isWithinSendWindow — default Lun-Ven 8-19 Europe/Rome", () => {
  it("lunedì 08:00 (estate) → dentro", () => {
    expect(isWithinSendWindow(new Date("2026-06-15T06:00:00Z"))).toBe(true);
  });
  it("lunedì 07:00 → fuori (prima dell'inizio)", () => {
    expect(isWithinSendWindow(new Date("2026-06-15T05:00:00Z"))).toBe(false);
  });
  it("lunedì 18:59 → dentro", () => {
    expect(isWithinSendWindow(new Date("2026-06-15T16:59:00Z"))).toBe(true);
  });
  it("lunedì 19:00 → fuori (fine esclusa)", () => {
    expect(isWithinSendWindow(new Date("2026-06-15T17:00:00Z"))).toBe(false);
  });
  it("inverno lunedì 08:00 → dentro (DST gestita)", () => {
    expect(isWithinSendWindow(new Date("2026-01-12T07:00:00Z"))).toBe(true);
  });
  it("inverno lunedì 07:00 → fuori", () => {
    expect(isWithinSendWindow(new Date("2026-01-12T06:00:00Z"))).toBe(false);
  });
  it("sabato → fuori (weekend)", () => {
    expect(isWithinSendWindow(new Date("2026-06-13T10:00:00Z"))).toBe(false);
  });
  it("domenica → fuori (weekend)", () => {
    expect(isWithinSendWindow(new Date("2026-06-14T10:00:00Z"))).toBe(false);
  });
});

describe("finestra personalizzata", () => {
  it("rispetta giorni/ore/fuso custom", () => {
    const w = { days: [6, 0], startHour: 10, endHour: 12, timeZone: "Europe/Rome" };
    expect(isWithinSendWindow(new Date("2026-06-13T08:30:00Z"), w)).toBe(true);  // sabato 10:30
    expect(isWithinSendWindow(new Date("2026-06-15T08:30:00Z"), w)).toBe(false); // lunedì non incluso
  });
  it("DEFAULT esportato è Lun-Ven 8-19", () => {
    expect(DEFAULT_SEND_WINDOW).toMatchObject({ days: [1, 2, 3, 4, 5], startHour: 8, endHour: 19, timeZone: "Europe/Rome" });
  });
});
