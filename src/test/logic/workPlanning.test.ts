import { describe, expect, it } from "vitest";
import { matchesWorkFilter, parseWorkAmount, phaseNeedsAttention, summarizeWork, validWorkDates, wouldDuplicateAssignment } from "@/lib/orders/workPlanning";
import { assignment, phase } from "../fixtures/workPlanning";

describe("Pianificazione cantiere", () => {
  const today = "2026-09-24";
  it("conta persone e squadre, non righe duplicate su più fasi", () => {
    const team = assignment({ id: "t1", source: "team", executor_type: "esterno", employee_id: null, external_team_id: "s1" });
    expect(summarizeWork([phase(), phase({ id: "p2", status: "completata" })], [assignment(), team, { ...team, id: "t2" }], today))
      .toEqual({ employees: 1, teams: 1, active: 1, completed: 1, attention: 0 });
  });
  it.each([
    { assignments: [] }, { start_date: null }, { end_date: null }, { end_date: "2026-09-23" },
    { start_date: "2026-10-02", end_date: "2026-10-01" },
  ])("evidenzia le fasi da organizzare %j", patch => expect(phaseNeedsAttention(phase(patch), today)).toBe(true));
  it("non segnala fasi completate o sane", () => {
    expect(phaseNeedsAttention(phase(), today)).toBe(false);
    expect(phaseNeedsAttention(phase({ status: "completata", assignments: [], end_date: null }), today)).toBe(false);
  });
  it("filtra stato e attenzione", () => {
    expect(matchesWorkFilter(phase(), "all", today)).toBe(true);
    expect(matchesWorkFilter(phase(), "in_corso", today)).toBe(true);
    expect(matchesWorkFilter(phase(), "completata", today)).toBe(false);
    expect(matchesWorkFilter(phase({ assignments: [] }), "attention", today)).toBe(true);
  });
  it.each([["", 0], ["12,50", 12.5], ["0", 0], ["4.5", 4.5], ["-1", null], ["abc", null], ["10abc", null], ["Infinity", null]])("valida importo %s", (raw, expected) => {
    expect(parseWorkAmount(String(raw))).toBe(expected);
  });
  it("accetta date parziali ma non invertite", () => {
    expect(validWorkDates(null, "2026-09-24")).toBe(true);
    expect(validWorkDates("2026-09-24", "2026-09-24")).toBe(true);
    expect(validWorkDates("2026-09-25", "2026-09-24")).toBe(false);
  });
  it("blocca spostamenti duplicati, non gli aggiornamenti di una riga esistente", () => {
    const current = assignment(); const other = assignment({ id: "a2", phase_id: "p1" });
    expect(wouldDuplicateAssignment([current, other], current, "p1")).toBe(true);
    expect(wouldDuplicateAssignment([current, other], current, "p2")).toBe(false);
    expect(wouldDuplicateAssignment([current, other], current, null)).toBe(false);
    expect(wouldDuplicateAssignment([current, other], other, null)).toBe(true);
  });
});
