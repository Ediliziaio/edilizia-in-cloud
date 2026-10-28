import type { ExecutorOption } from '@/hooks/useOrderWorkPhases';

export type AssignmentCompanyOption = ExecutorOption & { subappaltatoreId?: string; unavailableReason?: string };
export type AssignmentTeam = { id: string; company_id: string; name: string; kind: string; is_active: boolean | null; subappaltatore_id: string | null };
export type AssignmentSubcontractor = { id: string; company_id: string; ragione_sociale: string; is_active: boolean | null };

/** Match only explicit links, never names. Existing teams keep their real IDs. */
export function assignmentCompanyOptions(companyId: string, teams: AssignmentTeam[], subcontractors: AssignmentSubcontractor[]): AssignmentCompanyOption[] {
  const subs = subcontractors.filter(sub => sub.company_id === companyId);
  const byId = new Map(subs.map(sub => [sub.id, sub]));
  const local = teams.filter(team => team.company_id === companyId && team.kind !== 'interna');
  const active = local.filter(team => team.is_active === true && (!team.subappaltatore_id || byId.get(team.subappaltatore_id)?.is_active !== false && byId.has(team.subappaltatore_id)));
  const linked = new Set(active.map(team => team.subappaltatore_id).filter(Boolean));
  return [
    ...active.map(team => ({ id: team.id, label: team.name, kind: 'esterna' as const })),
    ...subs.filter(sub => sub.is_active !== false && !linked.has(sub.id)).map(sub => ({
      id: `subappaltatore:${sub.id}`, label: sub.ragione_sociale, kind: 'esterna' as const, subappaltatoreId: sub.id,
      ...(local.some(team => team.subappaltatore_id === sub.id && team.is_active !== true)
        ? { unavailableReason: 'La ditta collegata è disattivata: riattivala prima di assegnarla.' } : {}),
    })),
  ].sort((a, b) => a.label.localeCompare(b.label, 'it'));
}
