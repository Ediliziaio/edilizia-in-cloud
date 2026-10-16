import { laborHourlyCost, laborLineCost, reviewHourlyCost, type LaborEmployee } from "@/lib/campo/laborCostReview";
import { calculateNetFromGross } from "@/lib/vatUtils";

type Amount = number | string | null | undefined;
export interface LaborLedgerRow {
  id: string; employee_id: string; hours_worked: Amount; total_cost: Amount;
  cost_preventivo: Amount; hourly_rate: Amount; planned_hours?: Amount; planned_hourly_rate?: Amount;
  employee: LaborEmployee | null;
}
export interface ExternalLaborRow {
  id: string; cost_preventivo: Amount; total_cost: Amount; vat_rate: Amount;
  team: { name: string; kind: string } | null;
}
export function laborAmount(value: Amount): number | null {
  if (value == null || (typeof value !== "number" && typeof value !== "string")) return null;
  if (typeof value === "string" && !/^\+?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n * 100 <= Number.MAX_SAFE_INTEGER ? n : null;
}
/** Planning only: malformed or overflowing products must not crash an assignment form. */
export function plannedLaborCost(hours: number | null, rate: number | null | undefined): number | null {
  if (laborAmount(hours) == null || laborAmount(rate) == null) return null;
  try { return laborLineCost(hours!, rate!); } catch { return null; }
}
/** Missing/invalid values remain unknown. All money is summed as decimal cents. */
export function sumLaborAmounts(values: Amount[]): number | null {
  let cents = 0;
  for (const raw of values) {
    const n = laborAmount(raw);
    if (n == null) return null;
    cents += Math.round(laborLineCost(1, n) * 100);
    if (!Number.isSafeInteger(cents)) return null;
  }
  return cents / 100;
}
/** Read model only: never reprice the ledger with today's employee tariff. */
export function laborEconomics(rows: LaborLedgerRow[], canReadEmployeeRates: boolean) {
  const groups = new Map<string, LaborLedgerRow[]>();
  for (const row of rows) {
    const entries = groups.get(row.employee_id);
    if (entries) entries.push(row);
    else groups.set(row.employee_id, [row]);
  }
  const people = [...groups.entries()].map(([id, entries]) => {
    const employee = entries.find(r => r.employee)?.employee ?? null;
    const hours = sumLaborAmounts(entries.map(r => r.hours_worked));
    const cost = sumLaborAmounts(entries.map(r => r.total_cost));
    const budget = sumLaborAmounts(entries.map(r => r.cost_preventivo));
    const rate = canReadEmployeeRates && employee ? reviewHourlyCost(employee) : null;
    const unpriced = entries.some(r => (laborAmount(r.hours_worked) ?? 0) > 0 && laborAmount(r.total_cost) === 0);
    return {
      id, name: [employee?.first_name, employee?.last_name].filter(Boolean).join(" ") || "Dipendente non disponibile",
      hours, cost, budget, rate, unpriced, plannedHours: sumLaborAmounts(entries.map(r=>r.planned_hours)),
      // Saved rounded rates cannot be multiplied again to reconstruct historical money.
      averageRate: hours != null && hours > 0 && cost != null && laborAmount(cost / hours) != null ? laborHourlyCost(cost, hours) : null,
      overBudget: budget != null && cost != null && cost > budget,
    };
  });
  return {
    people,
    hours: sumLaborAmounts(rows.map(r => r.hours_worked)),
    plannedHours: rows.length ? sumLaborAmounts(rows.map(r=>r.planned_hours)) : null,
    cost: sumLaborAmounts(rows.map(r => r.total_cost)),
    budget: rows.length ? sumLaborAmounts(rows.map(r => r.cost_preventivo)) : null,
    unpricedPeople: people.filter(p => p.unpriced).length,
  };
}
/** Subcontract ledger stores gross amounts, unlike employee costs. Match economics.ts. */
export function externalLaborNet(row: ExternalLaborRow): number | null {
  const gross = laborAmount(row.total_cost);
  const vat = row.vat_rate == null ? 22 : laborAmount(row.vat_rate);
  if (gross == null || vat == null || vat > 100) return null;
  return calculateNetFromGross(gross, vat).netAmount;
}
