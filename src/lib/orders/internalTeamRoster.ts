/** Composizione organizzativa: non è un'assegnazione, una presenza o un costo. */
export interface CrewEmployee {
  id: string;
  name: string;
  active: boolean;
  userId: string | null;
}

export interface CrewRoster {
  version: string | null;
  employeeIds: string[];
  leaderEmployeeId: string | null;
  effectiveFrom: string | null;
}

export interface CrewSnapshot {
  teamId: string;
  teamName: string;
  teamActive: boolean;
  canManage: boolean;
  roster: CrewRoster;
  employees: CrewEmployee[];
}

export function crewRosterError(ids: string[], leaderId: string | null, employees: CrewEmployee[]): string | null {
  if (!ids.length) return "Scegli almeno un dipendente.";
  if (ids.length > 100) return "Una squadra può contenere al massimo 100 dipendenti.";
  if (new Set(ids).size !== ids.length) return "Un dipendente può comparire una sola volta.";
  const available = new Set(employees.filter(e => e.active).map(e => e.id));
  if (ids.some(id => !available.has(id))) return "Rimuovi i dipendenti non più disponibili prima di salvare.";
  if (leaderId && !ids.includes(leaderId)) return "Il referente deve essere uno dei dipendenti selezionati.";
  return null;
}

/** Deliberately fail closed. Local frontend + remote backend is NOT local mode. */
export function isLocalCrewBackend(url: string | undefined, optIn: string | undefined): boolean {
  if (optIn !== "true" || !url) return false;
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) &&
      ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) &&
      !parsed.username && !parsed.password;
  } catch { return false; }
}

export interface CrewAssignmentPreview {
  employee: CrewEmployee;
  alreadyAssigned: boolean;
  accountLinked: boolean;
}

export function previewCrewAssignment(
  ids: string[], employees: CrewEmployee[],
  existing: { employee_id: string | null; phase_id: string | null }[], phaseId: string | null,
): CrewAssignmentPreview[] {
  // Unknown/inactive IDs are errors, never silently dropped to assign half a crew.
  const error = crewRosterError(ids, null, employees);
  if (error) throw new Error(error);
  return ids.map(id => ({
    employee: employees.find(e => e.id === id)!,
    alreadyAssigned: existing.some(a => a.employee_id === id && a.phase_id === phaseId),
    accountLinked: !!employees.find(e => e.id === id)!.userId,
  }));
}
