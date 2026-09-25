import { crewRosterError, type CrewSnapshot } from "./internalTeamRoster";

/** Scheduling only: never actual hours, labor costs or a Campo authorization. */
export interface CrewShiftDraft {
  shiftId: string;
  expectedVersion: string | null;
  rosterVersion: string;
  workDate: string;
  startTime: string;
  endTime: string;
  phaseId: string | null;
  employeeIds: string[];
  leaderEmployeeId: string | null;
  notes: string;
  status: "planned" | "cancelled";
}
export interface CrewShift extends CrewShiftDraft {
  version: string;
  teamId: string;
  teamName: string;
  participants: { id: string; name: string; userId: string | null; kind: "member" | "replacement" | "excluded" }[];
}
export interface CrewShiftContext { companyId: string; orderId: string; teamId: string }
export interface CrewShiftCommand extends CrewShiftDraft, CrewShiftContext { operationId: string }

export function validShiftDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= "2000-01-01" && value <= "2100-12-31";
}
export function shiftMinutes(value: string): number | null {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}
export function shiftHours(draft: Pick<CrewShiftDraft, "startTime" | "endTime">) {
  const start = shiftMinutes(draft.startTime), end = shiftMinutes(draft.endTime);
  return start === null || end === null || end <= start ? null : (end - start) / 60;
}
export function crewShiftError(draft: CrewShiftDraft, snapshot: CrewSnapshot, phaseIds: readonly string[]): string | null {
  if (!snapshot.teamActive) return "La squadra non è attiva.";
  if (!snapshot.roster.version) return "Salva prima la composizione in Impostazioni → Calendari lavori → Squadre.";
  if (draft.rosterVersion !== snapshot.roster.version) return "Ricarica la composizione della squadra prima di pianificare.";
  if (!validShiftDate(draft.workDate)) return "Inserisci un giorno valido.";
  if (shiftHours(draft) === null) return "L'orario di fine deve seguire l'inizio nello stesso giorno. I turni notturni non sono ancora supportati.";
  if (draft.phaseId !== null && !phaseIds.includes(draft.phaseId)) return "La lavorazione non è più disponibile: ricontrolla la scelta.";
  if (draft.notes.length > 1000) return "Le note possono contenere al massimo 1000 caratteri.";
  if (draft.status !== "planned") return "Usa l'azione di annullamento del turno.";
  return crewRosterError(draft.employeeIds, draft.leaderEmployeeId, snapshot.employees);
}
export function crewShiftChanges(snapshot: CrewSnapshot, employeeIds: readonly string[]) {
  const selected = new Set(employeeIds), base = new Set(snapshot.roster.employeeIds);
  return {
    excluded: snapshot.roster.employeeIds.filter(id => !selected.has(id)),
    replacements: employeeIds.filter(id => !base.has(id)),
    noAccount: snapshot.employees.filter(e => selected.has(e.id) && !e.userId).map(e => e.id),
  };
}
export function overlappingShifts(draft: CrewShiftDraft, shifts: readonly CrewShift[]) {
  return shifts.filter(s => s.status === "planned" && s.shiftId !== draft.shiftId && s.workDate === draft.workDate &&
    s.startTime < draft.endTime && draft.startTime < s.endTime && s.employeeIds.some(id => draft.employeeIds.includes(id)));
}
export function shiftFingerprint(draft: CrewShiftDraft) {
  return JSON.stringify({ ...draft, employeeIds: [...draft.employeeIds].sort(), notes: draft.notes.trim() });
}
