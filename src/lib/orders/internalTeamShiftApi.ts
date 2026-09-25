import { isLocalCrewBackend } from "./internalTeamRoster";
import type { CrewBackendConfig, CrewRpcClient } from "./internalTeamRosterApi";
import { validShiftDate, type CrewShift, type CrewShiftCommand } from "./internalTeamShift";

export const SHIFT_NOT_ENABLED = "Pianificazione squadre disponibile solo sul database locale di collaudo. Nessun incarico Campo viene creato.";
function requireLocal(config: CrewBackendConfig) {
  if (!isLocalCrewBackend(config.url, config.optIn)) throw new Error(SHIFT_NOT_ENABLED);
}
function isShift(value: unknown): value is CrewShift {
  if (!value || typeof value !== "object") return false;
  const s = value as CrewShift;
  const nullableString = (v: unknown) => v === null || typeof v === "string";
  return [s.shiftId, s.version, s.rosterVersion, s.teamId, s.teamName, s.startTime, s.endTime, s.notes].every(v => typeof v === "string") &&
    typeof s.workDate === "string" && validShiftDate(s.workDate) && nullableString(s.phaseId) && nullableString(s.expectedVersion) && nullableString(s.leaderEmployeeId) &&
    (s.status === "planned" || s.status === "cancelled") && Array.isArray(s.employeeIds) && s.employeeIds.every(id => typeof id === "string") &&
    Array.isArray(s.participants) && s.participants.every(p => !!p && typeof p.id === "string" && typeof p.name === "string" && nullableString(p.userId) && ["member", "replacement", "excluded"].includes(p.kind));
}
export async function loadCrewShifts(client: CrewRpcClient, config: CrewBackendConfig, companyId: string, orderId: string, from: string, to: string): Promise<CrewShift[]> {
  requireLocal(config);
  if (!companyId || !orderId || !validShiftDate(from) || !validShiftDate(to) || from > to) throw new Error("Azienda, commessa e intervallo validi sono obbligatori.");
  const { data, error } = await client.rpc("internal_team_shifts_v1", { p_company_id: companyId, p_order_id: orderId, p_from: from, p_to: to });
  if (error) throw new Error(error.code === "PGRST202" ? SHIFT_NOT_ENABLED : error.message);
  if (!Array.isArray(data) || !data.every(isShift)) throw new Error("Risposta turni incompleta. Ricarica prima di modificare.");
  return data;
}
export async function saveCrewShift(client: CrewRpcClient, config: CrewBackendConfig, input: CrewShiftCommand): Promise<string> {
  requireLocal(config);
  if (!input.companyId || !input.orderId || !input.teamId || !input.shiftId || !input.operationId) throw new Error("Identificativi mancanti.");
  const { data, error } = await client.rpc("save_internal_team_shift_v1", {
    p_company_id: input.companyId, p_order_id: input.orderId, p_team_id: input.teamId,
    p_shift_id: input.shiftId, p_expected_version: input.expectedVersion, p_operation_id: input.operationId,
    p_roster_version: input.rosterVersion, p_work_date: input.workDate, p_start_time: input.startTime, p_end_time: input.endTime,
    p_phase_id: input.phaseId, p_employee_ids: [...input.employeeIds].sort(), p_leader_employee_id: input.leaderEmployeeId,
    p_notes: input.notes.trim(), p_status: input.status,
  });
  if (error) throw new Error(error.code === "PT409" || error.code === "40001" ? "Turno o composizione modificati da un'altra sessione. Ricarica e ricontrolla le persone." : error.message);
  if (data !== input.operationId) throw new Error("Esito non verificato. Riprova senza modificare la selezione: la richiesta mantiene lo stesso identificativo.");
  return data;
}
