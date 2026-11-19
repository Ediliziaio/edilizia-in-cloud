import { planningDay, type OrderPlanningDates } from "./planning";

export interface PlanningPhase { id: string; name: string; start_date: string | null; end_date: string | null }

/** Solo il previsto salvato sulle fasi: mai date reali, durate stimate o il giorno di oggi. */
export function planningSchedule(phases: ReadonlyArray<PlanningPhase>, dates: OrderPlanningDates) {
  const rows = phases.map(phase => {
    const start = planningDay(phase.start_date), end = planningDay(phase.end_date);
    const invalid = !!((phase.start_date && !start) || (phase.end_date && !end) || (start && end && end < start));
    const complete = !!start && !!end && !invalid;
    const outside = !invalid && !!((start && dates.work_start_date && start < dates.work_start_date) ||
      (end && dates.work_end_date && end > dates.work_end_date));
    return { ...phase, start, end, invalid, complete, outside };
  });
  const planned = rows.filter(row => row.complete);
  const starts = planned.map(row => row.start).sort(), ends = planned.map(row => row.end).sort();
  const start = starts[0] || null, end = ends[ends.length - 1] || null;
  const missing = rows.filter(row => !row.invalid && !row.complete).length;
  const invalid = rows.filter(row => row.invalid).length;
  const canAlign = !!start && !!end && missing === 0 && invalid === 0;
  const samePeriod = canAlign && start === dates.work_start_date && end === dates.work_end_date;
  const warnings: string[] = [];
  const inizio = planningDay(dates.work_start_date), fine = planningDay(dates.work_end_date);
  const posa = planningDay(dates.expected_date), arrivo = planningDay(dates.warehouse_arrival_date);
  if (posa && ((inizio && posa < inizio) || (fine && posa > fine))) warnings.push("La consegna / posa prevista è fuori dal periodo lavori. Verifica il traguardo o il periodo della commessa.");
  if (arrivo && fine && arrivo > fine) warnings.push("L'arrivo materiali è successivo alla fine lavori prevista.");
  return { rows, start, end, missing, invalid, canAlign, samePeriod, outside: rows.filter(row => row.outside).length, warnings };
}
