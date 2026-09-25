import type { PhaseAssignment, WorkPhase } from "@/hooks/useOrderWorkPhases";
export const assignment = (patch: Partial<PhaseAssignment> = {}): PhaseAssignment => ({
  id: "a1", source: "employee", phase_id: null, executor_type: "interno", employee_id: "e1", external_team_id: null,
  cost_preventivo: 200, cost_consuntivo: 120, hours: 4, is_paid: false, paid_date: null, notes: "Posa rivestimenti", ...patch,
});
export const phase = (patch: Partial<WorkPhase> = {}): WorkPhase => ({
  id: "p1", order_id: "order", name: "Opere murarie", position: 0, status: "in_corso", start_date: "2026-09-20",
  end_date: "2026-09-30", notes: null, percentuale: 40, assignments: [assignment({ phase_id: "p1" })], ...patch,
});
