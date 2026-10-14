import type { PhaseAssignment, WorkPhase } from "@/hooks/useOrderWorkPhases";
import type { SquadraInCommessa } from "@/hooks/useOperai";
import { laborAmount, sumLaborAmounts } from "./laborEconomics";
import { laborHourlyCost } from "@/lib/campo/laborCostReview";

/** Read model only. A crew membership is not an extra time/cost entry. */
export function resourceStatistics(phases: WorkPhase[], assignments: PhaseAssignment[], crews: SquadraInCommessa[]) {
  const rows = [...new Map(assignments.map(a => [`${a.source}:${a.id}`, a])).values()];
  const people = new Map<string, PhaseAssignment[]>();
  for (const row of rows) {
    const key = row.source === "employee" ? `employee:${row.employee_id ?? row.id}` : `team:${row.external_team_id ?? row.id}`;
    people.set(key, [...(people.get(key) ?? []), row]);
  }
  const internal = rows.filter(a => a.source === "employee");
  const external = rows.filter(a => a.source === "team");
  const crewGroups = [...new Map(crews.map(s => [s.squadra_id, s])).values()];
  const covered = new Set([...rows.flatMap(a => a.phase_id ? [a.phase_id] : []), ...crews.flatMap(s => s.phase_id ? [s.phase_id] : [])]);
  return {
    people: [...people.entries()].map(([id, rows]) => {
      const hours = rows.reduce((n, a) => n + (a.hours ?? 0), 0);
      const cost = sumLaborAmounts(rows.map(a => a.cost_consuntivo));
      return {
      id, rows, hours, cost,
      averageRate: rows[0].source === "employee" && rows.every(a => laborAmount(a.hours) != null) && hours > 0 && Number.isFinite(hours) && cost != null && laborAmount(cost / hours) != null ? laborHourlyCost(cost, hours) : null,
      unknownHours: rows.filter(a => a.hours == null).length,
      phaseIds: [...new Set(rows.flatMap(a => a.phase_id ? [a.phase_id] : []))],
      general: rows.some(a => !a.phase_id),
    };}),
    employees: [...people.keys()].filter(k => k.startsWith("employee:")).length,
    companies: [...people.keys()].filter(k => k.startsWith("team:")).length,
    crews: crewGroups,
    hours: internal.reduce((n, a) => n + (a.hours ?? 0), 0),
    unknownHours: internal.filter(a => a.hours == null).length,
    coveredPhases: phases.filter(p => covered.has(p.id)).length,
    budget: rows.reduce((n, a) => n + a.cost_preventivo, 0),
    actual: rows.reduce((n, a) => n + a.cost_consuntivo, 0),
    internalBudget: internal.length ? sumLaborAmounts(internal.map(a => a.cost_preventivo)) : null,
    internalActual: sumLaborAmounts(internal.map(a => a.cost_consuntivo)),
    externalBudgetGross: external.length ? sumLaborAmounts(external.map(a => a.cost_preventivo)) : null,
    externalActualGross: sumLaborAmounts(external.map(a => a.cost_consuntivo)),
    unpricedEmployees: new Set(internal.filter(a => (a.hours ?? 0) > 0 && a.cost_consuntivo === 0).map(a => a.employee_id ?? a.id)).size,
  };
}
