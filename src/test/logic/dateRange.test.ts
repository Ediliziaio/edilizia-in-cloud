import { describe, expect, it } from "vitest";
import { inDateRange } from "@/lib/orders/dateRange";
import { inOperationalPeriod, operationalPeriod } from "@/lib/orders/operationalFilters";

describe("intervallo di date operativo", () => {
  it("include il primo e l'ultimo giorno, anche con l'orario", () => {
    expect(inDateRange("2026-11-01T09:00:00+01:00","2026-11-01","2026-11-30")).toBe(true);
    expect(inDateRange("2026-11-30T21:00:00+01:00","2026-11-01","2026-11-30")).toBe(true);
    expect(inDateRange("2026-12-01","2026-11-01","2026-11-30")).toBe(false);
  });
  it("non allarga la ricerca in caso di date assenti, non valide o invertite", () => {
    for (const [from,to] of [["",""],["2026-11-30","2026-11-01"],["2026-02-30",""]]) expect(inDateRange("2026-11-10",from,to)).toBe(false);
    expect(inDateRange(null,"2026-11-01","")).toBe(false);
    expect(inDateRange("2026-11-10","2026-11-01","")).toBe(true);
  });
  it("riconosce il periodo personalizzato e usa l'intervallo scelto", () => {
    expect(operationalPeriod("personalizzato")).toBe("personalizzato");
    expect(inOperationalPeriod("2026-10-10","personalizzato",undefined,{da:"2026-10-01",a:"2026-10-31"})).toBe(true);
  });
});
