import { describe, expect, it, vi } from "vitest";
import { campoPlanningDate, loadCampoCrewAgenda, validAgendaRange, type CampoCrewShift } from "@/lib/campo/crewAgenda";

const config = { url: "http://127.0.0.1:58321", optIn: "true" };
const row: CampoCrewShift = { shiftId: "s", version: "v", companyId: "c", orderId: "o", teamName: "Squadra", phaseName: "Posa", orderCode: "C-1", orderDescription: "Lavori", address: null, workDate: "2026-09-24", startTime: "08:00", endTime: "12:00", isReferente: false, status: "planned" };
describe("Agenda personale squadre", () => {
  it.each([undefined, "https://shared.supabase.co", "http://localhost.evil", "http://user:pass@localhost"])("non chiama backend non locale %s", async url => {
    const rpc = vi.fn();
    await expect(loadCampoCrewAgenda({ rpc }, { ...config, url }, "c", row.workDate, row.workDate)).rejects.toThrow(/locale/);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("richiede opt-in anche su localhost", async () => {
    const rpc = vi.fn();
    await expect(loadCampoCrewAgenda({ rpc }, { ...config, optIn: undefined }, "c", row.workDate, row.workDate)).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([["2026-02-29", "2026-02-29"], ["2026-09-24", "2026-09-23"], ["2026-09-24", "2026-10-26"]])("rifiuta intervallo %s-%s", (a,b) => expect(validAgendaRange(a,b)).toBe(false));
  it("accetta 32 giorni e gestisce confini ora italiana/DST", () => {
    expect(validAgendaRange("2026-09-24", "2026-10-25")).toBe(true);
    expect(campoPlanningDate(new Date("2026-09-24T22:30:00Z"))).toBe("2026-09-25");
    expect(campoPlanningDate(new Date("2026-12-24T23:30:00Z"))).toBe("2026-12-25");
  });
  it("richiede la sola identità server e ordina più cantieri senza unirli", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ ...row, shiftId: "second", orderId: "other", startTime: "12:00", endTime: "16:00" }, row], error: null });
    const result = await loadCampoCrewAgenda({ rpc }, config, "c", row.workDate, row.workDate);
    expect(result.map(r => r.orderId)).toEqual(["o", "other"]);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("campo_my_team_shifts_v1", { p_company_id: "c", p_from: row.workDate, p_to: row.workDate });
    expect(result[0]).not.toHaveProperty("is_capocantiere");
  });
  it.each([{ companyId: "other" }, { workDate: "2026-09-25" }, { startTime: "12:00" }, { isReferente: undefined }, { orderDescription: undefined }, { status: "invalid" }])("rifiuta risposta incongruente %j", async patch => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ ...row, ...patch }], error: null });
    await expect(loadCampoCrewAgenda({ rpc }, config, "c", row.workDate, row.workDate)).rejects.toThrow(/non verificabile/);
  });
  it("non nasconde duplicati, errori o backend incompleto dietro calendario vuoto", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: [row,row] }).mockResolvedValueOnce({ error: { code: "PGRST202", message: "missing" } }).mockResolvedValueOnce({ error: { message: "Rete assente" } });
    await expect(loadCampoCrewAgenda({ rpc }, config, "c", row.workDate, row.workDate)).rejects.toThrow(/non verificabile/);
    await expect(loadCampoCrewAgenda({ rpc }, config, "c", row.workDate, row.workDate)).rejects.toThrow(/non ancora installata/);
    await expect(loadCampoCrewAgenda({ rpc }, config, "c", row.workDate, row.workDate)).rejects.toThrow("Rete assente");
  });
});
