import type {ExecutorOption, PhaseAssignment, WorkPhase} from "@/hooks/useOrderWorkPhases";
import type {SquadraInCommessa} from "@/hooks/useOperai";
import type {MezzoDellaPersona} from "@/hooks/useCantiereLogistica";

export interface TeamWorkGroup {
  id: string;
  phase?: WorkPhase;
  assignments: PhaseAssignment[];
  crews: SquadraInCommessa[];
  equipment: MezzoDellaPersona[];
}

export function assignmentName(a: PhaseAssignment, employees: ExecutorOption[], teams: ExecutorOption[]) {
  return a.executor_label || (a.executor_type === "interno" ? employees.find(e => e.id === a.employee_id)?.label ?? "Dipendente non disponibile" : teams.find(t => t.id === a.external_team_id)?.label ?? "Ditta non disponibile");
}

/** Presentation only: no copied assignment, hours or costs. Respect the crew's period. */
export function generalCrewsForPhase(phase: Pick<WorkPhase, "start_date" | "end_date">, crews: SquadraInCommessa[]) {
  return [...new Map(crews.filter(s => {
    if (s.phase_id || !s.attiva) return false;
    const valid = (d: string | null) => !d || /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T12:00:00Z`)) && new Date(`${d}T12:00:00Z`).toISOString().slice(0, 10) === d;
    if (![phase.start_date, phase.end_date, s.dal, s.al].every(valid)) return false;
    if (s.dal && s.al && s.al < s.dal || phase.start_date && phase.end_date && phase.end_date < phase.start_date) return false;
    if (!phase.start_date && !phase.end_date) return !s.finita;
    if (phase.end_date && s.dal && phase.end_date < s.dal) return false;
    if (phase.start_date && s.al && phase.start_date > s.al) return false;
    return true;
  }).map(s => [s.squadra_id, s])).values()];
}

/** A presentation only: preserve assignment identity, never combine quantities or costs. */
export function teamWorkPlan(phases: WorkPhase[], general: PhaseAssignment[], crews: SquadraInCommessa[], equipment: MezzoDellaPersona[], all: PhaseAssignment[] = []) {
  const groups: TeamWorkGroup[] = [{id: "general", assignments: [], crews: [], equipment: []}, ...phases.map((phase): TeamWorkGroup => ({id: phase.id, phase, assignments: [], crews: [], equipment: []}))];
  const byPhase = new Map(groups.map(g => [g.id, g]));
  const groupFor = (phaseId: string | null) => {
    const id = phaseId ?? "general";
    let group = byPhase.get(id);
    if (!group) { group = {id, assignments: [], crews: [], equipment: []}; groups.push(group); byPhase.set(id, group); }
    return group;
  };
  const seen = new Set<string>();
  for (const a of [...all, ...general, ...phases.flatMap(p => p.assignments)]) {
    const identity = `${a.source}:${a.id}`;
    if (seen.has(identity)) continue;
    seen.add(identity); groupFor(a.phase_id).assignments.push(a);
  }
  const seenCrews = new Set<string>();
  for (const crew of crews) {
    const identity = `${crew.phase_id ?? "general"}:${crew.squadra_id}`;
    if (!seenCrews.has(identity)) { seenCrews.add(identity); groupFor(crew.phase_id).crews.push(crew); }
  }
  for (const mezzo of equipment) for (const phaseId of mezzo.fasi ?? [null]) {
    const group = groupFor(phaseId);
    if (!group.equipment.some(m => m.id === mezzo.id)) group.equipment.push(mezzo);
  }
  return groups;
}
