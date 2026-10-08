import { describe, expect, it } from "vitest";
import { isCalendarDate, quoteDraftIssue, rapportinoContentIssue, workHoursIssue } from "../../../supabase/functions/_shared/operationalDraftValidation";
describe("Operational data must not be silently invented or rounded", () => {
  it.each(["2026-02-29", "2026-02-30", "2026-13-01", "2026-00-10", "2026-10-00", "ieri", null])("rejects impossible work date %j", value => expect(isCalendarDate(value)).toBe(false));
  it.each(["2024-02-29", "2026-10-07"])("accepts actual calendar date %s", value => expect(isCalendarDate(value)).toBe(true));
  it.each([[-1, 0], [8, -1], [8, Infinity], [NaN, 0], ["8", 0], [17, 0], [8, 9]])("rejects invalid hours %j + %j", (normal, extra) => expect(workHoursIssue(normal, extra)).not.toBeNull());
  it("allows precise fractional hours without rounding", () => expect(workHoursIssue(7.25, 1.75)).toBeNull());
  it.each([{ attivita: [" "] }, { materiali_usati: [{ descrizione: "Cemento", quantita: -1 }] },
    { materiali_usati: [{ descrizione: "" }] }, { data_lavoro: "2026-02-30" }])("rejects incomplete report content %j", args => expect(rapportinoContentIssue(args)).not.toBeNull());
  it("distinguishes explicitly free goods and VAT zero from missing prices", () => {
    const args = { client_name: "Cliente", items: [{ name: "Omaggio", quantity: 1, unit_price: 0, vat_rate: 0 }] };
    expect(quoteDraftIssue(args)).toBeNull();
    expect(quoteDraftIssue({ ...args, items: [{ name: "Omaggio", quantity: 1, vat_rate: 0 }] })).toContain("prezzo verificato");
  });
});
