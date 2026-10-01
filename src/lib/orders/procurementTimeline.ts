import { civilDay, floorWorkingDate, shiftCivilDays, type DayCalendar } from "./civilDate";

export interface ProcurementGate {
  id: string;
  label: string;
  date: string | null;
  state: "planned" | "confirmed";
}
export interface ProcurementTimelineInput {
  asOf: string;
  contractDate: string | null;
  requiredOnSite: string;
  leadMinDays: number | null;
  leadMaxDays: number | null;
  supplierCalendar?: DayCalendar;
  logisticsDays: number;
  bufferDays: number;
  preparationDays: number;
  gates: readonly ProcurementGate[];
}

/** Read-only what-if schedule. Never places an order or asserts cash availability. */
export function planProcurementTimeline(input: ProcurementTimelineInput) {
  civilDay(input.asOf); civilDay(input.requiredOnSite);
  if (input.supplierCalendar) shiftCivilDays(input.requiredOnSite, 0, input.supplierCalendar);
  if (input.contractDate) civilDay(input.contractDate);
  for (const n of [input.logisticsDays, input.bufferDays, input.preparationDays, input.leadMinDays, input.leadMaxDays]) {
    if (n != null && (!Number.isSafeInteger(n) || n < 0 || n > 36_600)) throw new RangeError("Durata non valida");
  }
  if (input.leadMinDays != null && input.leadMaxDays != null && input.leadMinDays > input.leadMaxDays) throw new RangeError("Intervallo fornitura invertito");
  const ids = new Set<string>();
  for (const gate of input.gates) {
    if (!gate.id || ids.has(gate.id)) throw new RangeError("Prerequisito duplicato o senza identità");
    ids.add(gate.id);
    if (gate.date) {
      civilDay(gate.date);
      if (gate.state === "confirmed" && gate.date > input.asOf) throw new RangeError("Una conferma effettiva non può essere futura");
    }
  }
  const missing: string[] = [];
  if (!input.contractDate) missing.push("Data contratto/autorizzazione acquisto");
  if (input.leadMinDays == null || input.leadMaxDays == null) missing.push("Tempi fornitore e calendario da confermare");
  for (const gate of input.gates) if (!gate.date) missing.push(gate.label);
  const latestDelivery = shiftCivilDays(input.requiredOnSite, -input.logisticsDays - input.bufferDays);
  const productionDeadline = input.supplierCalendar && input.leadMaxDays != null && input.leadMaxDays > 0 ? floorWorkingDate(latestDelivery, input.supplierCalendar) : latestDelivery;
  const latestLaunch = input.leadMaxDays == null ? null : shiftCivilDays(productionDeadline, -input.leadMaxDays, input.supplierCalendar);
  const latestDecision = latestLaunch == null ? null : shiftCivilDays(latestLaunch, -input.preparationDays);
  const conditional = input.gates.some(g => g.state === "planned");
  const earliestPreparation = [input.asOf, input.contractDate ?? input.asOf].sort().at(-1)!;
  const preparationReady = shiftCivilDays(earliestPreparation, input.preparationDays);
  const earliestLaunch = missing.length ? null : [preparationReady, ...input.gates.map(g => g.date!)].sort().at(-1)!;
  const earliestDelivery = earliestLaunch == null ? null : shiftCivilDays(earliestLaunch, input.leadMinDays!, input.supplierCalendar);
  const prudentDelivery = earliestLaunch == null ? null : shiftCivilDays(earliestLaunch, input.leadMaxDays!, input.supplierCalendar);
  const readyOnSite = prudentDelivery == null ? null : shiftCivilDays(prudentDelivery, input.logisticsDays + input.bufferDays);
  const delayDays = readyOnSite == null ? null : Math.max(0, civilDay(readyOnSite) - civilDay(input.requiredOnSite));
  const status = missing.length ? "incomplete" : delayDays! > 0 ? "late" : conditional ? "conditional" : "feasible";
  return { status, missing, conditional, latestDelivery, latestLaunch, latestDecision, earliestLaunch, earliestDelivery, prudentDelivery, readyOnSite, delayDays,
    launchDeadlinePassed: latestLaunch != null && latestLaunch < input.asOf,
    gateDeadlines: input.gates.map(g => ({ id: g.id, label: g.label, latestDate: latestLaunch, overdue: latestLaunch != null && (!g.date || g.date > latestLaunch) })) };
}
