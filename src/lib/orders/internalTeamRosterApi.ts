import { crewRosterError, isLocalCrewBackend, type CrewSnapshot } from "./internalTeamRoster";

export interface CrewRpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
}
export interface CrewBackendConfig { url?: string; optIn?: string }
export interface SaveCrewRoster {
  companyId: string; teamId: string; expectedVersion: string | null;
  operationId: string; employeeIds: string[]; leaderEmployeeId: string | null;
}

export const CREW_NOT_ENABLED = "Composizione squadre non ancora attiva su questo database. Nessun dato è stato salvato.";

function requireLocal(config: CrewBackendConfig) {
  if (!isLocalCrewBackend(config.url, config.optIn)) throw new Error(CREW_NOT_ENABLED);
}

function validSnapshot(data: unknown, teamId: string): data is CrewSnapshot {
  if (!data || typeof data !== "object") return false;
  const s = data as Partial<CrewSnapshot>;
  const nullableString = (v: unknown) => v === null || typeof v === "string";
  return s.teamId === teamId && typeof s.teamName === "string" && typeof s.teamActive === "boolean" && typeof s.canManage === "boolean" &&
    !!s.roster && nullableString(s.roster.version) && nullableString(s.roster.leaderEmployeeId) && nullableString(s.roster.effectiveFrom) &&
    Array.isArray(s.roster.employeeIds) && s.roster.employeeIds.every(id => typeof id === "string") &&
    new Set(s.roster.employeeIds).size === s.roster.employeeIds.length &&
    Array.isArray(s.employees) && s.employees.every(e => !!e && typeof e.id === "string" && typeof e.name === "string" && typeof e.active === "boolean" && nullableString(e.userId)) &&
    new Set(s.employees.map(e => e.id)).size === s.employees.length;
}

export async function loadCrewSnapshot(client: CrewRpcClient, config: CrewBackendConfig, companyId: string, teamId: string): Promise<CrewSnapshot> {
  requireLocal(config);
  if (!companyId || !teamId) throw new Error("Azienda e squadra obbligatorie.");
  const { data, error } = await client.rpc("internal_team_roster_v1", { p_company_id: companyId, p_team_id: teamId });
  if (error) throw new Error(error.code === "PGRST202" ? CREW_NOT_ENABLED : error.message);
  if (!validSnapshot(data, teamId)) {
    throw new Error("Risposta squadra incompleta: ricarica prima di modificare.");
  }
  return data;
}

export async function saveCrewRoster(client: CrewRpcClient, config: CrewBackendConfig, snapshot: CrewSnapshot, input: SaveCrewRoster): Promise<string> {
  requireLocal(config);
  if (!input.companyId || !input.operationId || snapshot.teamId !== input.teamId || !snapshot.canManage || !snapshot.teamActive) {
    throw new Error("Non puoi modificare questa squadra.");
  }
  const invalid = crewRosterError(input.employeeIds, input.leaderEmployeeId, snapshot.employees);
  if (invalid) throw new Error(invalid);
  const { data, error } = await client.rpc("save_internal_team_roster_v1", {
    p_company_id: input.companyId, p_team_id: input.teamId,
    p_expected_version: input.expectedVersion, p_operation_id: input.operationId,
    p_employee_ids: [...input.employeeIds].sort(), p_leader_employee_id: input.leaderEmployeeId,
  });
  if (error) throw new Error(error.code === "PT409" || error.code === "40001"
    ? "La squadra è stata modificata da un'altra sessione. Ricarica e ricontrolla i membri."
    : error.message);
  if (data !== input.operationId) throw new Error("Esito non verificato. Riprova senza cambiare i dati: la richiesta mantiene lo stesso identificativo.");
  return data;
}
