import { describe, expect, it, vi } from "vitest";
import { crewShiftChanges, crewShiftError, overlappingShifts, shiftFingerprint, shiftHours, validShiftDate, type CrewShift, type CrewShiftDraft } from "@/lib/orders/internalTeamShift";
import { loadCrewShifts, saveCrewShift } from "@/lib/orders/internalTeamShiftApi";
import type { CrewSnapshot } from "@/lib/orders/internalTeamRoster";

const snapshot: CrewSnapshot = { teamId: "t", teamName: "Squadra", teamActive: true, canManage: false,
  roster: { version: "r", employeeIds: ["a", "b"], leaderEmployeeId: "a", effectiveFrom: "2026-09-24" },
  employees: [{ id: "a", name: "Anna", active: true, userId: "ua" }, { id: "b", name: "Bruno", active: true, userId: null }, { id: "c", name: "Carlo", active: true, userId: "uc" }, { id: "d", name: "Dora", active: false, userId: null }] };
const draft: CrewShiftDraft = { shiftId: "s", expectedVersion: null, rosterVersion: "r", workDate: "2026-09-24", startTime: "08:00", endTime: "12:00", phaseId: null, employeeIds: ["a", "b"], leaderEmployeeId: "a", notes: "", status: "planned" };
const shift = (patch: Partial<CrewShift> = {}): CrewShift => ({ ...draft, shiftId: "other", version: "v", teamId: "t", teamName: "Squadra", participants: [], ...patch });
const config = { url: "http://127.0.0.1:58321", optIn: "true" };
const command = { ...draft, companyId: "co", orderId: "o", teamId: "t", operationId: "op" };

describe("Turni interni · modello", () => {
  it.each(["2026-02-29", "2026-09-31", "garbage", "2026-9-1", "1999-01-01", "2101-01-01"])("rifiuta data %s", date => expect(validShiftDate(date)).toBe(false));
  it("accetta data bisestile", () => expect(validShiftDate("2028-02-29")).toBe(true));
  it("calcola la fascia senza chiamarla consuntivo", () => expect(shiftHours({ startTime: "08:30", endTime: "12:45" })).toBe(4.25));
  it.each([["12:00", "08:00"], ["08:00", "08:00"], ["25:00", "26:00"], ["8:00", "12:00"]])("blocca fascia %s-%s", (startTime, endTime) => expect(shiftHours({ startTime, endTime })).toBeNull());
  it("permette di pianificare a chi legge il roster senza poterlo modificare", () => expect(crewShiftError(draft, snapshot, [])).toBeNull());
  it.each([
    [{ employeeIds: [] }, /almeno|1|dipendente/i], [{ employeeIds: ["a", "a"] }, /sola volta/i],
    [{ employeeIds: ["d"], leaderEmployeeId: null }, /disponibil/i], [{ employeeIds: ["missing"] }, /disponibil/i],
    [{ employeeIds: ["b"], leaderEmployeeId: "a" }, /referente/i], [{ phaseId: "gone" }, /lavorazione/i],
    [{ rosterVersion: "old" }, /composizione/i], [{ notes: "x".repeat(1001) }, /1000/],
  ])("valida selezione %j", (patch, pattern) => expect(crewShiftError({ ...draft, ...patch }, snapshot, [])).toMatch(pattern));
  it("distingue esclusi, rinforzi e persone senza login", () => expect(crewShiftChanges(snapshot, ["b", "c"])).toEqual({ excluded: ["a"], replacements: ["c"], noAccount: ["b"] }));
  it("rifiuta sovrapposizioni e consente cantieri adiacenti", () => {
    expect(overlappingShifts(draft, [shift({ startTime: "11:00", endTime: "15:00" })])).toHaveLength(1);
    expect(overlappingShifts(draft, [shift({ startTime: "12:00", endTime: "15:00" }), shift({ status: "cancelled" }), shift({ employeeIds: ["c"] }), shift({ workDate: "2026-09-25" }), shift({ shiftId: "s" })])).toHaveLength(0);
  });
  it("chiave bozza indipendente da ordine selezioni e spazi note", () => expect(shiftFingerprint(draft)).toBe(shiftFingerprint({ ...draft, employeeIds: ["b", "a"], notes: "  " })));
});
describe("Turni interni · confine API", () => {
  it.each([undefined, "https://shared.supabase.co", "http://localhost.evil", "http://127.0.0.2"])("nessuna RPC su %s", async url => {
    const rpc = vi.fn();
    await expect(saveCrewShift({ rpc }, { url, optIn: "true" }, command)).rejects.toThrow(/locale/);
    await expect(loadCrewShifts({ rpc }, { url, optIn: "true" }, "c", "o", draft.workDate, draft.workDate)).rejects.toThrow(/locale/);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("salva con una sola RPC ordinata, senza fallback in scritture individuali", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "op", error: null });
    await expect(saveCrewShift({ rpc }, config, { ...command, employeeIds: ["b", "a"] })).resolves.toBe("op");
    expect(rpc).toHaveBeenCalledOnce(); expect(rpc.mock.calls[0][1].p_employee_ids).toEqual(["a", "b"]);
  });
  it("distingue conflitto, ricevuta incerta e risposta incompleta", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ error: { code: "PT409", message: "stale" } }).mockResolvedValueOnce({ data: "wrong", error: null }).mockResolvedValueOnce({ data: [{}], error: null });
    await expect(saveCrewShift({ rpc }, config, command)).rejects.toThrow(/altra sessione/);
    await expect(saveCrewShift({ rpc }, config, command)).rejects.toThrow(/Esito non verificato/);
    await expect(loadCrewShifts({ rpc }, config, "c", "o", draft.workDate, draft.workDate)).rejects.toThrow(/incompleta/);
  });
});
