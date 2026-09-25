import { isLocalCrewBackend } from "@/lib/orders/internalTeamRoster";
import { shiftHours, validShiftDate } from "@/lib/orders/internalTeamShift";
import type { CrewBackendConfig, CrewRpcClient } from "@/lib/orders/internalTeamRosterApi";

/** Personal planning only. Never used as a Campo authorization or actual hours. */
export interface CampoCrewShift {
  shiftId: string;
  version: string;
  companyId: string;
  orderId: string;
  teamName: string;
  phaseName: string | null;
  orderCode: string | null;
  orderDescription: string | null;
  address: string | null;
  workDate: string;
  startTime: string;
  endTime: string;
  isReferente: boolean;
  status: "planned" | "cancelled";
}

export function campoPlanningDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function validAgendaRange(from: string, to: string): boolean {
  return validShiftDate(from) && validShiftDate(to) && from <= to &&
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 <= 31;
}

function isShift(row: unknown, companyId: string, from: string, to: string): row is CampoCrewShift {
  if (!row || typeof row !== "object") return false;
  const s = row as CampoCrewShift;
  const nullable = (v: unknown) => v === null || typeof v === "string";
  return s.companyId === companyId && [s.shiftId, s.version, s.orderId, s.teamName].every(v => typeof v === "string" && !!v.trim()) &&
    [s.phaseName, s.orderCode, s.orderDescription, s.address].every(nullable) &&
    typeof s.workDate === "string" && validShiftDate(s.workDate) && s.workDate >= from && s.workDate <= to &&
    typeof s.startTime === "string" && typeof s.endTime === "string" && shiftHours(s) !== null &&
    typeof s.isReferente === "boolean" && ["planned", "cancelled"].includes(s.status);
}

export async function loadCampoCrewAgenda(client: CrewRpcClient, config: CrewBackendConfig, companyId: string, from: string, to: string): Promise<CampoCrewShift[]> {
  if (!isLocalCrewBackend(config.url, config.optIn)) throw new Error("Agenda squadre disponibile solo sul database locale di collaudo.");
  if (!companyId || !validAgendaRange(from, to)) throw new Error("Scegli azienda e intervallo validi, fino a 32 giorni.");
  // Identity comes exclusively from auth.uid() on the server, never a passed user ID.
  const { data, error } = await client.rpc("campo_my_team_shifts_v1", { p_company_id: companyId, p_from: from, p_to: to });
  if (error) throw new Error(error.code === "PGRST202" ? "Agenda turni non ancora installata sul database locale." : error.message);
  if (!Array.isArray(data) || !data.every(s => isShift(s, companyId, from, to)) || new Set(data.map(s => s.shiftId)).size !== data.length) {
    throw new Error("Agenda non verificabile. Ricarica prima di usare i turni.");
  }
  return data.sort((a, b) => a.workDate.localeCompare(b.workDate) || a.startTime.localeCompare(b.startTime) || a.shiftId.localeCompare(b.shiftId));
}
