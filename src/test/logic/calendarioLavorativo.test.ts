import { describe, it, expect } from "vitest";
import { italianHolidays, projectHoliday, workingDates, missingItalianHolidays, isoDay } from "@/lib/personale/calendarioLavorativo";
describe("calendario HR", () => {
  it("calculates movable holidays separately for each year", () => {
    expect(italianHolidays(2026)).toContainEqual({data:"2026-04-06",descrizione:"Lunedì dell’Angelo",ricorrente:false});
    expect(italianHolidays(2027)).toContainEqual({data:"2027-03-29",descrizione:"Lunedì dell’Angelo",ricorrente:false});
  });
  it("includes San Francesco from 2026, not in 2025", () => {
    expect(italianHolidays(2026).some(h=>h.data.endsWith("10-04"))).toBe(true);
    expect(italianHolidays(2025).some(h=>h.data.endsWith("10-04"))).toBe(false);
  });
  it("projects recurring dates without shifting leap days", () => {
    expect(projectHoliday({data:"2024-02-29",ricorrente:true,descrizione:"Test"},2025)).toBeNull();
    expect(projectHoliday({data:"2024-12-25",ricorrente:true,descrizione:"Natale"},2026)?.projectedDate).toBe("2026-12-25");
  });
  it("does not suppress this year's holiday because of a past one-off", () => {
    expect(missingItalianHolidays([{data:"2025-01-01",ricorrente:false,descrizione:"One off"}],2026).some(h=>h.data==="2026-01-01")).toBe(true);
    expect(missingItalianHolidays(italianHolidays(2026),2026)).toEqual([]);
  });
  it("uses the person's workweek and holiday calendar through DST", () => {
    expect(workingDates("2026-03-27","2026-03-31",["Lun","Mar","Mer","Gio","Ven"],[])).toEqual(["2026-03-27","2026-03-30","2026-03-31"]);
    expect(workingDates("2026-04-03","2026-04-07",["Lun","Mar","Ven"],italianHolidays(2026))).toEqual(["2026-04-03","2026-04-07"]);
  });
  it("supports Saturday workers and never guesses a missing schedule", () => {
    expect(workingDates("2026-10-23","2026-10-25",["Sab"],[])).toEqual(["2026-10-24"]);
    expect(()=>workingDates("2026-10-23","2026-10-25",[],[])).toThrow("configurare");
    expect(()=>isoDay("2026-02-30")).toThrow();
  });
});
