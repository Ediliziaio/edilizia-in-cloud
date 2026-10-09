import { canonicalOrderEconomics, ORDER_ECONOMICS_COLUMNS, type CanonicalOrderEconomics } from "./orderEconomics.ts";

export function silvioFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= Number.MAX_SAFE_INTEGER / 100 ? number : null;
}

const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Check the official snapshot; never replace missing components with zero or rewrite the ledger. */
export function silvioVerifiedEconomics(row: Record<string, unknown>): {
  actual: CanonicalOrderEconomics | null; error: string | null;
} {
  const fields = ORDER_ECONOMICS_COLUMNS.split(", ");
  if (fields.some(key => silvioFiniteNumber(row[key]) === null)) {
    return { actual: null, error: "La fonte economica ha importi o componenti mancanti o non validi. Nessun margine calcolato." };
  }
  const actual = canonicalOrderEconomics(row);
  if ([actual.warehouseMovementsWithoutCost, actual.pendingMileageReimbursementsCount]
    .some(count => count < 0 || !Number.isSafeInteger(count))) {
    return { actual: null, error: "La fonte economica ha conteggi di completezza non validi. Nessun margine calcolato." };
  }
  const costs = actual.purchases + actual.warehouseMaterials + actual.labor + actual.commissions
    + actual.mileageReimbursements + actual.errors + actual.directCosts;
  const margin = actual.revenue - actual.costs;
  const mismatch = (a: number, b: number) => Math.abs(round(a) - round(b)) > 0.011;
  // The official view rounds margin percentage to ONE decimal, not two.
  if (mismatch(actual.revenue, actual.baseRevenue + actual.approvedVariations)
    || mismatch(actual.costs, costs) || mismatch(actual.margin, margin)
    || Math.abs(actual.marginPct - (actual.revenue > 0 ? margin / actual.revenue * 100 : 0)) > 0.051) {
    return { actual: null, error: "I totali economici non coincidono con le componenti della fonte. Verifica la commessa: nessun margine certificato." };
  }
  return { actual, error: null };
}

export const SILVIO_COST_EXCLUSIONS = ["materiali", "manodopera", "rimborsi_km"] as const;
export type SilvioCostExclusion = typeof SILVIO_COST_EXCLUSIONS[number];

/** One mutually exclusive category, from the same validated snapshot; no extra totals or invoices. */
export function silvioCostScenario(actual: CanonicalOrderEconomics, category: SilvioCostExclusion, partial: boolean) {
  const excluded = category === "materiali" ? actual.purchases + actual.warehouseMaterials
    : category === "manodopera" ? actual.labor : actual.mileageReimbursements;
  const costs = round(actual.costs - excluded);
  const margin = round(actual.revenue - costs);
  return {
    tipo: "Simulazione aritmetica sui costi registrati, non margine reale o previsione",
    categoria_esclusa: category, costo_escluso: round(excluded), ricavi_invariati: actual.revenue,
    costi_simulati: costs, margine_simulato: margin,
    percentuale_simulata: actual.revenue > 0 ? round(margin / actual.revenue * 100) : null,
    parziale: partial,
    formula: "costi simulati = consuntivo − categoria esclusa; margine simulato = ricavi − costi simulati",
    limite: category === "rimborsi_km" ? "Esclude solo rimborsi km approvati: non carburante, tempo di viaggio o costo dei mezzi."
      : category === "manodopera" ? "Comprende la manodopera aggregata della fonte: non distingue operai interni e subappalto."
      : "Esclude acquisti e materiali di magazzino della fonte. Gli acquisti possono comprendere servizi: non è una separazione analitica certificata dei soli materiali.",
  };
}
