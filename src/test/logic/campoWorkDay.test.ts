import { describe, expect, it } from "vitest";
import { assertReportDay, campoWorkDay, reportDayAllowed, shiftWorkDay, validWorkDay } from "@/lib/campo/workDay";
import { campoDayWindow, summarizeCampoTime } from "@/lib/campo/timeSummary";

describe("Rapportino giornaliero: termine giorno successivo in Italia", () => {
  it("riconosce la mezzanotte italiana, non quella UTC", () => {
    expect(campoWorkDay(new Date("2026-09-24T22:01:00Z"))).toBe("2026-09-25");
  });
  it.each(["2026-02-30", "2026-13-01", "2026-9-1", "invalid", ""])("rifiuta date malformate %s", day => expect(validWorkDay(day)).toBe(false));
  it("accetta oggi e ieri, non domani né due giorni fa", () => {
    const now = new Date("2026-09-24T12:00:00Z");
    expect(reportDayAllowed("2026-09-24", now)).toBe(true);
    expect(reportDayAllowed("2026-09-23", now)).toBe(true);
    expect(reportDayAllowed("2026-09-22", now)).toBe(false);
    expect(reportDayAllowed("2026-09-25", now)).toBe(false);
  });
  it("la scadenza è la mezzanotte successiva, non 24 ore dall'apertura", () => {
    expect(reportDayAllowed("2026-09-23", new Date("2026-09-24T23:59:59.999+02:00"))).toBe(true);
    expect(() => assertReportDay("2026-09-23", new Date("2026-09-25T00:00:00+02:00"))).toThrow("giorno successivo");
  });
  it("gestisce cambio mese, anno e bisestile", () => {
    expect(shiftWorkDay("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftWorkDay("2024-03-01", -1)).toBe("2024-02-29");
  });
  it.each([["2026-03-29", 23], ["2026-10-25", 25], ["2026-09-24", 24]] as const)("durata civile %s: %s ore", (day, hours) => {
    const { start, end } = campoDayWindow(day);
    expect((end.getTime() - start.getTime()) / 3600000).toBe(hours);
  });
  it("ripartisce un turno notturno confermato fra ieri e oggi", () => {
    const punches = [
      { tipo: "entrata", timestamp_evento: "2026-09-23T22:00:00+02:00", order_id: "A" },
      { tipo: "uscita", timestamp_evento: "2026-09-24T02:00:00+02:00", order_id: "A" },
    ];
    const now = new Date("2026-09-24T12:00:00+02:00");
    for (const day of ["2026-09-23", "2026-09-24"]) {
      expect(summarizeCampoTime(punches, { ...campoDayWindow(day), now }).workMinutes).toBe(120);
    }
  });
});
