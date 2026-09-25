import { describe, expect, it, vi } from "vitest";
import { crewRosterError, isLocalCrewBackend, previewCrewAssignment, type CrewSnapshot } from "@/lib/orders/internalTeamRoster";
import { loadCrewSnapshot, saveCrewRoster, type SaveCrewRoster } from "@/lib/orders/internalTeamRosterApi";

const employees = [
  { id: "a", name: "Anna Bianchi", active: true, userId: "account-a" },
  { id: "b", name: "Bruno Rossi", active: true, userId: null },
  { id: "c", name: "Carlo Verdi", active: false, userId: "account-c" },
];
const snapshot: CrewSnapshot = { teamId: "team", teamName: "Squadra A", teamActive: true, canManage: true, roster: { version: "old", employeeIds: ["a"], leaderEmployeeId: null, effectiveFrom: "2026-09-24" }, employees };
const config = { url: "http://127.0.0.1:54321", optIn: "true" };
const input: SaveCrewRoster = { companyId: "company", teamId: "team", expectedVersion: "old", operationId: "operation", employeeIds: ["b", "a"], leaderEmployeeId: "a" };

describe("Composizione squadra interna", () => {
  it.each([[], ["a", "a"], ["unknown"], ["c"]].map(ids => ({ ids })))("rifiuta selezione non valida $ids", ({ ids }) => expect(crewRosterError(ids, null, employees)).toBeTruthy());
  it("accetta un dipendente senza account e non richiede un referente", () => expect(crewRosterError(["a", "b"], null, employees)).toBeNull());
  it("rifiuta referente fuori squadra e oltre 100 persone", () => {
    expect(crewRosterError(["a"], "b", employees)).toMatch(/referente/);
    expect(crewRosterError(Array.from({ length: 101 }, (_, i) => String(i)), null, [])).toMatch(/100/);
  });
  it("anteprima distingue persona già assegnata nella fase e persona senza account", () => {
    const result = previewCrewAssignment(["a", "b"], employees, [{ employee_id: "a", phase_id: "phase" }, { employee_id: "b", phase_id: null }], "phase");
    expect(result.map(r => [r.alreadyAssigned, r.accountLinked])).toEqual([[true, true], [false, false]]);
    expect(result.every(r => !("cost" in r))).toBe(true);
  });
  it("non prepara mezza squadra ignorando un membro sconosciuto", () => expect(() => previewCrewAssignment(["a", "missing"], employees, [], null)).toThrow(/disponibili/));
});

describe("Attivazione locale conservativa", () => {
  it.each(["http://localhost:54321", "http://127.0.0.1:54321", "http://[::1]:54321"])("accetta backend loopback %s con opt-in", url => expect(isLocalCrewBackend(url, "true")).toBe(true));
  it.each([undefined, "https://project.supabase.co", "https://localhost.evil.test", "http://127.0.0.1.evil.test", "file://localhost/db", "http://user:pass@localhost", "invalid"])("blocca backend non locale %s", url => expect(isLocalCrewBackend(url, "true")).toBe(false));
  it("richiede opt-in esplicito", () => expect(isLocalCrewBackend(config.url, undefined)).toBe(false));
});

describe("API composizione · richieste simulate, nessuna rete", () => {
  it("non effettua alcuna RPC verso un backend remoto", async () => {
    const client = { rpc: vi.fn() };
    await expect(loadCrewSnapshot(client, { ...config, url: "https://project.supabase.co" }, "company", "team")).rejects.toThrow(/non ancora attiva/);
    await expect(saveCrewRoster(client, { ...config, url: "https://project.supabase.co" }, snapshot, input)).rejects.toThrow(/non ancora attiva/);
    expect(client.rpc).not.toHaveBeenCalled();
  });
  it("carica una composizione senza scambiare un errore schema per lista vuota", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST202", message: "missing" } }) };
    await expect(loadCrewSnapshot(client, config, "company", "team")).rejects.toThrow(/non ancora attiva/);
    client.rpc.mockResolvedValue({ data: snapshot, error: null });
    expect(await loadCrewSnapshot(client, config, "company", "team")).toEqual(snapshot);
  });
  it("rifiuta dati di un'altra squadra e risposte incomplete", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: { ...snapshot, teamId: "other" }, error: null }) };
    await expect(loadCrewSnapshot(client, config, "company", "team")).rejects.toThrow(/incompleta/);
  });
  it("invia un solo comando atomico con versione attesa e ID stabile", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: "operation", error: null }) };
    expect(await saveCrewRoster(client, config, snapshot, input)).toBe("operation");
    expect(client.rpc).toHaveBeenCalledExactlyOnceWith("save_internal_team_roster_v1", { p_company_id: "company", p_team_id: "team", p_expected_version: "old", p_operation_id: "operation", p_employee_ids: ["a", "b"], p_leader_employee_id: "a" });
  });
  it.each([{ ...snapshot, canManage: false }, { ...snapshot, teamActive: false }])("non invia se non modificabile", async s => {
    const client = { rpc: vi.fn() }; await expect(saveCrewRoster(client, config, s, input)).rejects.toThrow(); expect(client.rpc).not.toHaveBeenCalled();
  });
  it.each(["PT409", "40001"])("spiega i conflitti %s e non finge successo senza ricevuta", async code => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: null, error: { code, message: "stale" } }) };
    await expect(saveCrewRoster(client, config, snapshot, input)).rejects.toThrow(/altra sessione/);
    client.rpc.mockResolvedValue({ data: null, error: null });
    await expect(saveCrewRoster(client, config, snapshot, input)).rejects.toThrow(/Esito non verificato/);
  });
});
