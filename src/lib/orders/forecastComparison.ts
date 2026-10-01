import { civilDay } from "./civilDate";

export interface ComparisonContext {
  companyId: string;
  orderId: string;
  scopeVersion: string;
  unit: string;
  basis: "net_cost" | "gross_cash" | "person_hours" | "quantity" | "civil_date";
}
export interface MeasureSnapshot {
  context: ComparisonContext;
  version: string;
  asOf: string;
  value: number | null;
  completeness: "complete" | "partial" | "missing";
}

/** Never compares different scopes, currencies, units, tenants or cutoffs. */
export function compareSnapshots(reference: MeasureSnapshot, observed: MeasureSnapshot, horizon: "to_date" | "at_completion") {
  civilDay(reference.asOf); civilDay(observed.asOf);
  const keys: (keyof ComparisonContext)[] = ["companyId", "orderId", "scopeVersion", "unit", "basis"];
  const mismatch = keys.filter(k => reference.context[k] !== observed.context[k]);
  if (!reference.version || !observed.version || keys.some(k => !String(reference.context[k]).trim() || !String(observed.context[k]).trim())) mismatch.push("scopeVersion");
  if (mismatch.length || reference.asOf > observed.asOf || (horizon === "to_date" && reference.asOf !== observed.asOf)) return { status: "not_comparable" as const, delta: null, percentage: null };
  if (reference.completeness !== "complete" || observed.completeness !== "complete" || reference.value == null || observed.value == null) return { status: "incomplete" as const, delta: null, percentage: null };
  if (!Number.isFinite(reference.value) || !Number.isFinite(observed.value)) throw new RangeError("Misura non valida");
  const delta = observed.value - reference.value;
  if (!Number.isFinite(delta)) throw new RangeError("Scostamento fuori intervallo");
  return { status: "comparable" as const, delta, percentage: reference.value === 0 || reference.context.basis === "civil_date" ? null : delta / Math.abs(reference.value) * 100 };
}

/** Bottom-up remaining cost: commitments must contain ONLY their unmatured portion. */
export function estimateCostAtCompletion(input: {
  actualAccrued: number | null;
  remainingCommitted: number | null;
  remainingUncommitted: number | null;
  incrementalRisk: number | null;
  approvedRevenue: number | null;
}) {
  const costs = [input.actualAccrued, input.remainingCommitted, input.remainingUncommitted, input.incrementalRisk];
  if (costs.some(x => x != null && (!Number.isFinite(x) || x < 0)) || (input.approvedRevenue != null && (!Number.isFinite(input.approvedRevenue) || input.approvedRevenue < 0))) throw new RangeError("Costo o ricavo non valido");
  if (costs.some(x => x == null)) return { status: "incomplete" as const, finalCost: null, remainingCost: null, margin: null, marginPercent: null };
  const round = (n: number) => {
    if (!Number.isFinite(n * 100)) throw new RangeError("Importo fuori intervallo");
    return Math.round((n + Number.EPSILON) * 100) / 100;
  };
  const remainingCost = round(input.remainingCommitted! + input.remainingUncommitted! + input.incrementalRisk!);
  const finalCost = round(input.actualAccrued! + remainingCost);
  const margin = input.approvedRevenue == null ? null : round(input.approvedRevenue - finalCost);
  return { status: "complete" as const, finalCost, remainingCost, margin, marginPercent: margin == null || !input.approvedRevenue ? null : margin / input.approvedRevenue * 100 };
}

/** Existing article convention is gross purchase price. OdA subtotal is net.
 * Approved SALES variations belong to revenue, never to material purchase cost. */
export function compareMaterialCommitments(items: readonly { purchase_price?: number | null; quantity: number; vat_rate?: number | null }[], orders: readonly { subtotal: number | null }[]) {
  const valid = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;
  const plannedComplete = items.every(i => valid(i.purchase_price) && valid(i.quantity) && valid(i.vat_rate) && i.vat_rate <= 100);
  const orderedComplete = orders.every(o => valid(o.subtotal));
  const planned = plannedComplete ? Math.round(items.reduce((s, i) => s + i.purchase_price! * i.quantity / (1 + i.vat_rate! / 100), 0) * 100) / 100 : null;
  const committed = orderedComplete ? Math.round(orders.reduce((s, o) => s + o.subtotal!, 0) * 100) / 100 : null;
  // A negative difference on a still-open procurement is NOT a realized saving.
  return { planned, committed, gap: planned == null || committed == null ? null : Math.round((committed - planned) * 100) / 100,
    percentage: planned == null || committed == null || planned === 0 ? null : (committed - planned) / planned * 100 };
}
