import { validWorkDates } from "./workPlanning";

export type CampoRole = "employee" | "subcontractor";

export function campoRoles(roles: readonly string[] = []): CampoRole[] {
  const result: CampoRole[] = [];
  if (roles.includes("employee") || roles.includes("worker")) result.push("employee");
  if (roles.includes("subcontractor")) result.push("subcontractor");
  return result;
}

export function campoAssignmentError(input: {
  userId: string; role: CampoRole; roles: readonly string[];
  start: string; end: string; isCapo: boolean; existing: boolean;
  otherCapo: boolean;
}): string | null {
  if (!input.userId) return "Seleziona un utente Campo";
  if (!campoRoles(input.roles).includes(input.role)) return "Il ruolo non corrisponde all'account selezionato";
  if (!validWorkDates(input.start, input.end)) return "La fine prevista non può precedere l'inizio";
  if (input.isCapo && input.otherCapo) return "È già presente un capocantiere. Gestisci prima la nomina esistente";
  if (input.existing && !input.isCapo) return "L'utente ha già un'assegnazione esplicita su questa commessa";
  return null;
}
