import type { PhaseAssignment, WorkPhase } from "@/hooks/useOrderWorkPhases";

export type WorkFilter = "all" | "in_corso" | "da_iniziare" | "completata" | "attention";

export function phaseNeedsAttention(phase: WorkPhase, today: string): boolean {
  return phase.status !== "completata" && (
    phase.assignments.length === 0 || !phase.start_date || !phase.end_date ||
    phase.end_date < today || phase.end_date < phase.start_date
  );
}

export function summarizeWork(phases: WorkPhase[], unassigned: PhaseAssignment[], today: string) {
  const assignments = [...unassigned, ...phases.flatMap(p => p.assignments)];
  const employees = new Set(assignments.filter(a => a.executor_type === "interno")
    .map(a => a.employee_id ?? a.id));
  const teams = new Set(assignments.filter(a => a.executor_type === "esterno")
    .map(a => a.external_team_id ?? a.id));
  return {
    employees: employees.size,
    teams: teams.size,
    active: phases.filter(p => p.status === "in_corso").length,
    completed: phases.filter(p => p.status === "completata").length,
    attention: phases.filter(p => phaseNeedsAttention(p, today)).length,
  };
}

export function matchesWorkFilter(phase: WorkPhase, filter: WorkFilter, today: string) {
  return filter === "all" || (filter === "attention"
    ? phaseNeedsAttention(phase, today)
    : phase.status === filter);
}

/** Empty is allowed for optional costs, but malformed/negative input is never silently zeroed. */
export function parseWorkAmount(raw: string): number | null {
  if (!raw.trim()) return 0;
  const value = Number(raw.trim().replace(",", "."));
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function validWorkDates(start: string | null, end: string | null) {
  return !start || !end || end >= start;
}

export function wouldDuplicateAssignment(assignments: PhaseAssignment[], current: PhaseAssignment, targetPhase: string | null) {
  if (current.phase_id === targetPhase) return false;
  const executorId = current.employee_id ?? current.external_team_id;
  return !!executorId && assignments.some(a => a.source === current.source && a.id !== current.id &&
    a.phase_id === targetPhase && (a.employee_id ?? a.external_team_id) === executorId);
}
