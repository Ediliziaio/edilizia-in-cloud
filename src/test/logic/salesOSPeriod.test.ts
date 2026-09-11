import { describe, expect, it } from "vitest";
import { getPeriodRange, toISODate } from "@/lib/salesOSPeriod";

// 11 settembre 2026, 01:30 ora locale: con toISOString, in Italia, il giorno
// sarebbe risultato il 10.
const notte = new Date(2026, 8, 11, 1, 30);

describe("periodi di Sales OS", () => {
  it("usa il giorno locale, non quello UTC", () => {
    expect(toISODate(notte)).toBe("2026-09-11");
    const oggi = getPeriodRange("today", notte);
    expect(oggi).toMatchObject({ dateFrom: "2026-09-11", dateTo: "2026-09-12", daysBack: 1 });
  });

  it("«7 giorni» e «30 giorni» sono oggi più i giorni prima, e daysBack ne è il numero", () => {
    expect(getPeriodRange("7d", notte)).toMatchObject({ dateFrom: "2026-09-05", dateTo: "2026-09-12", daysBack: 7 });
    expect(getPeriodRange("30d", notte)).toMatchObject({ dateFrom: "2026-08-13", dateTo: "2026-09-12", daysBack: 30 });
  });

  it("trimestre, anno e 12 mesi partono dal primo giorno giusto", () => {
    expect(getPeriodRange("quarter", notte)).toMatchObject({ dateFrom: "2026-07-01", daysBack: 31 + 31 + 11 });
    expect(getPeriodRange("ytd", notte)).toMatchObject({ dateFrom: "2026-01-01", daysBack: 254 });
    expect(getPeriodRange("12m", notte)).toMatchObject({ dateFrom: "2025-09-12", daysBack: 365 });
  });

  it("a cavallo dell'ora legale i giorni restano interi", () => {
    // 29 marzo 2026: l'ora legale toglie un'ora alla notte
    const dopo = new Date(2026, 3, 2, 10, 0);
    expect(getPeriodRange("7d", dopo)).toMatchObject({ dateFrom: "2026-03-27", daysBack: 7 });
  });
});
