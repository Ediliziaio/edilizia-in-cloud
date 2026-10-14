import { laborAmount, sumLaborAmounts } from "@/lib/orders/laborEconomics";
import { reportParticipants, reportStatus, type LaborReport } from "@/lib/campo/laborCostReview";

export function hrMonthBounds(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Seleziona un mese valido.");
  const [year, m] = month.split("-").map(Number);
  if (year < 1900 || year > 2200) throw new Error("Anno non valido.");
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, "0")}` };
}
export interface HrCostDay {
  data: string; stato: string; ore_lavorate: number | string | null;
  ore_straordinario: number | string | null; anomalia: boolean;
}
export interface HrCostReport extends LaborReport {
  costo_registrato_at: string | null; presenze_registrate: unknown;
  order: { order_code: string | null; description: string | null } | null;
}
const ABSENCES = new Set(["ferie", "permesso", "rol", "malattia", "infortunio", "maternita", "paternita", "lutto", "festivita", "assente", "non_lavorativo"]);
const sum = (values: Parameters<typeof sumLaborAmounts>[0]) => {
  const amount = sumLaborAmounts(values);
  if (amount == null) throw new Error("Totale ore/costi fuori intervallo: verifica i dati.");
  return amount;
};

/** Selected person/month only. Approval snapshots are the cost source, not today's rate. */
export function reconcileHrLabor(input: { companyId: string; employeeId: string; userId: string | null; month: string; days: HrCostDay[]; reports: HrCostReport[] | null }) {
  const { start, end } = hrMonthBounds(input.month);
  const days = input.days.filter(d => d.data >= start && d.data <= end);
  const dateCounts = new Map<string, number>();
  for (const d of days) dateCounts.set(d.data, (dateCounts.get(d.data) ?? 0) + 1);
  const validDays = days.filter(d => dateCounts.get(d.data) === 1 && !d.anomalia && laborAmount(d.ore_lavorate) != null && laborAmount(d.ore_straordinario) != null &&
    Number(d.ore_lavorate) <= 24 && Number(d.ore_straordinario) <= Number(d.ore_lavorate) &&
    !(ABSENCES.has(d.stato) && !["permesso", "rol"].includes(d.stato) && Number(d.ore_lavorate) > 0));
  const validDates = new Set(validDays.map(d => d.data));
  const hrHours = sum(validDays.map(d => d.ore_lavorate));
  const overtime = sum(validDays.map(d => d.ore_straordinario)); // already included, do not add
  const absenceDays = new Set(days.filter(d => ABSENCES.has(d.stato)).map(d => d.data)).size;
  const jobs = new Map<string, { id: string; label: string; hours: number; cost: number; pendingHours: number; unknown: number }>();
  const reportDates = new Set<string>(); const seen = new Set<string>();
  let invalidSnapshots = 0, missingSnapshots = 0, unpricedSnapshots = 0;
  for (const r of input.reports ?? []) {
    if (r.company_id !== input.companyId || r.data_lavoro < start || r.data_lavoro > end || seen.has(r.id)) continue;
    seen.add(r.id);
    const status = reportStatus(r);
    if (!["approvato", "inviato"].includes(status)) continue;
    const declared = reportParticipants(r, [{ id: input.employeeId, user_id: input.userId }]).find(p => p.key === `employee:${input.employeeId}`);
    const snapshot = Array.isArray(r.presenze_registrate) ? r.presenze_registrate as { employee_id?: string; ore?: number | string; costo?: number | string }[] : null;
    const own = snapshot?.filter(p => p && p.employee_id === input.employeeId) ?? [];
    if (!own.length && (!declared || declared.hours === 0)) continue; // capo reporting others is not extra labor
    const job = jobs.get(r.order_id) ?? { id: r.order_id, label: r.order?.order_code || r.order?.description || "Commessa non disponibile", hours: 0, cost: 0, pendingHours: 0, unknown: 0 };
    jobs.set(r.order_id, job);
    if (status === "inviato") {
      if (declared?.hours != null && declared.hours >= 0 && declared.hours <= 24) job.pendingHours = sum([job.pendingHours, declared.hours]);
      else job.unknown++;
      continue;
    }
    if (!r.costo_registrato_at || !snapshot || !own.length) { missingSnapshots++; job.unknown++; continue; }
    if (own.length !== 1 || laborAmount(own[0].ore) == null || Number(own[0].ore) > 24 || laborAmount(own[0].costo) == null) { invalidSnapshots++; job.unknown++; continue; }
    job.hours = sum([job.hours, own[0].ore]);
    job.cost = sum([job.cost, own[0].costo]);
    if (Number(own[0].ore) > 0 && Number(own[0].costo) === 0) { unpricedSnapshots++; job.unknown++; }
    reportDates.add(r.data_lavoro);
  }
  const rows = [...jobs.values()];
  const registeredHours = sum(rows.map(j => j.hours));
  const registeredCost = sum(rows.map(j => j.cost));
  const pendingHours = sum(rows.map(j => j.pendingHours));
  const incomplete = rows.some(j => j.unknown > 0);
  const comparable = input.reports !== null && !incomplete && days.length > 0 && validDays.length === days.length &&
    reportDates.size > 0 && [...reportDates].every(d => validDates.has(d));
  return { rows, hrHours, overtime, absenceDays, anomalousDays: days.length - validDays.length,
    missingHrDays: [...reportDates].filter(d => !validDates.has(d)).length,
    registeredHours, registeredCost, pendingHours, incomplete, missingSnapshots, invalidSnapshots, unpricedSnapshots,
    reportsAvailable: input.reports !== null,
    gapHours: comparable ? Math.round((hrHours - registeredHours) * 100) / 100 : null,
  };
}
