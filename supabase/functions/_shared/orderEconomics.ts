export const ORDER_ECONOMICS_COLUMNS = "preventivo_contratto, variazioni_approvate, preventivo_totale, costo_acquisti, costo_materiali_magazzino, movimenti_magazzino_senza_costo, costo_manodopera, costo_provvigioni, costo_rimborsi_km, rimborsi_km_da_approvare, numero_rimborsi_km_da_approvare, costo_errori, costo_diretto, consuntivo, margine, margine_perc";

export interface EconItem { name?: string; purchase_price?: number | null; quantity: number; vat_rate?: number | null }

/**
 * Snapshot ufficiale della commessa, letto da v_ordine_marginalita.
 *
 * I campi sono volutamente distinti dal preventivo locale (`econ`): questo e'
 * il consuntivo condiviso da dettaglio commessa e Controllo di Gestione.
 */
export interface CanonicalOrderEconomics {
  baseRevenue: number;
  approvedVariations: number;
  revenue: number;
  purchases: number;
  warehouseMaterials: number;
  warehouseMovementsWithoutCost: number;
  labor: number;
  commissions: number;
  mileageReimbursements: number;
  pendingMileageReimbursements: number;
  pendingMileageReimbursementsCount: number;
  errors: number;
  directCosts: number;
  costs: number;
  margin: number;
  marginPct: number;
}

export type EconomicsQualityStatus = "ready" | "partial" | "missing" | "unavailable";

export interface EconomicsQualityIssue {
  code:
    | "source_unavailable"
    | "missing_revenue"
    | "no_registered_costs"
    | "warehouse_movements_without_cost"
    | "pending_mileage_reimbursements"
    | "items_without_cost"
    | "employees_without_cost"
    | "teams_without_cost";
  label: string;
  count?: number;
}

export interface EconomicsQuality {
  status: EconomicsQualityStatus;
  label: string;
  score: number;
  issues: EconomicsQualityIssue[];
  /** Il margine puo' essere mostrato, ma se status=partial va marcato come parziale. */
  canShowMargin: boolean;
}

export interface CanonicalEconomicsRow {
  preventivo_contratto?: number | null;
  variazioni_approvate?: number | null;
  preventivo_totale?: number | null;
  costo_acquisti?: number | null;
  costo_materiali_magazzino?: number | null;
  movimenti_magazzino_senza_costo?: number | null;
  costo_manodopera?: number | null;
  costo_provvigioni?: number | null;
  costo_rimborsi_km?: number | null;
  rimborsi_km_da_approvare?: number | null;
  numero_rimborsi_km_da_approvare?: number | null;
  costo_errori?: number | null;
  costo_diretto?: number | null;
  consuntivo?: number | null;
  margine?: number | null;
  margine_perc?: number | null;
}

const finite = (value: number | null | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Normalizza la vista DB senza ricalcolare formule in pagina. */
export function canonicalOrderEconomics(row: CanonicalEconomicsRow | null | undefined): CanonicalOrderEconomics {
  return {
    baseRevenue: finite(row?.preventivo_contratto),
    approvedVariations: finite(row?.variazioni_approvate),
    revenue: finite(row?.preventivo_totale),
    purchases: finite(row?.costo_acquisti),
    warehouseMaterials: finite(row?.costo_materiali_magazzino),
    warehouseMovementsWithoutCost: finite(row?.movimenti_magazzino_senza_costo),
    labor: finite(row?.costo_manodopera),
    commissions: finite(row?.costo_provvigioni),
    mileageReimbursements: finite(row?.costo_rimborsi_km),
    pendingMileageReimbursements: finite(row?.rimborsi_km_da_approvare),
    pendingMileageReimbursementsCount: finite(row?.numero_rimborsi_km_da_approvare),
    errors: finite(row?.costo_errori),
    directCosts: finite(row?.costo_diretto),
    costs: finite(row?.consuntivo),
    margin: finite(row?.margine),
    marginPct: finite(row?.margine_perc),
  };
}

/**
 * Valuta l'attendibilita', non la redditivita'. Un margine alto con costi
 * assenti e' un dato incompleto, non un buon risultato.
 */
export function assessOrderEconomicsQuality(input: {
  sourceAvailable: boolean;
  actual: CanonicalOrderEconomics;
  items: EconItem[];
  employees: { total_cost: number }[];
  teams: { total_cost: number }[];
}): EconomicsQuality {
  const issues: EconomicsQualityIssue[] = [];
  const { sourceAvailable, actual, items, employees, teams } = input;

  if (!sourceAvailable) {
    issues.push({ code: "source_unavailable", label: "Fonte economica non disponibile" });
  }
  if (actual.revenue <= 0) {
    issues.push({ code: "missing_revenue", label: "Ricavo della commessa da definire" });
  }
  if (actual.revenue > 0 && actual.costs <= 0) {
    issues.push({ code: "no_registered_costs", label: "Nessun costo registrato" });
  }
  if (actual.warehouseMovementsWithoutCost > 0) {
    const count = actual.warehouseMovementsWithoutCost;
    issues.push({
      code: "warehouse_movements_without_cost",
      label: `${count} ${count === 1 ? "prelievo di magazzino senza costo" : "prelievi di magazzino senza costo"}`,
      count,
    });
  }
  if (actual.pendingMileageReimbursementsCount > 0) {
    const count = actual.pendingMileageReimbursementsCount;
    issues.push({
      code: "pending_mileage_reimbursements",
      label: `${count} ${count === 1 ? "rimborso km da approvare" : "rimborsi km da approvare"}`,
      count,
    });
  }

  const itemsWithoutCost = items.filter(
    (item) => finite(item.quantity) > 0 && finite(item.purchase_price) <= 0,
  ).length;
  if (itemsWithoutCost > 0) {
    issues.push({
      code: "items_without_cost",
      label: `${itemsWithoutCost} ${itemsWithoutCost === 1 ? "articolo senza costo" : "articoli senza costo"}`,
      count: itemsWithoutCost,
    });
  }

  const employeesWithoutCost = employees.filter((employee) => finite(employee.total_cost) <= 0).length;
  if (employeesWithoutCost > 0) {
    issues.push({
      code: "employees_without_cost",
      label: `${employeesWithoutCost} ${employeesWithoutCost === 1 ? "operaio senza costo" : "operai senza costo"}`,
      count: employeesWithoutCost,
    });
  }

  const teamsWithoutCost = teams.filter((team) => finite(team.total_cost) <= 0).length;
  if (teamsWithoutCost > 0) {
    issues.push({
      code: "teams_without_cost",
      label: `${teamsWithoutCost} ${teamsWithoutCost === 1 ? "squadra esterna senza costo" : "squadre esterne senza costo"}`,
      count: teamsWithoutCost,
    });
  }

  const unavailable = !sourceAvailable;
  const missing = !unavailable && (actual.revenue <= 0 || actual.costs <= 0);
  const partial = !unavailable && !missing && issues.length > 0;
  const status: EconomicsQualityStatus = unavailable
    ? "unavailable"
    : missing
      ? "missing"
      : partial
        ? "partial"
        : "ready";

  const score = status === "unavailable"
    ? 0
    : Math.max(0, 100
      - (actual.revenue <= 0 ? 40 : 0)
      - (actual.costs <= 0 ? 40 : 0)
      - Math.min(20, actual.warehouseMovementsWithoutCost * 5)
      - Math.min(10, actual.pendingMileageReimbursementsCount * 2)
      - Math.min(20, itemsWithoutCost * 5)
      - Math.min(20, employeesWithoutCost * 5)
      - Math.min(20, teamsWithoutCost * 5));

  const labels: Record<EconomicsQualityStatus, string> = {
    ready: "Dati attendibili",
    partial: "Dati parziali",
    missing: "Dati da completare",
    unavailable: "Dati non disponibili",
  };

  return {
    status,
    label: labels[status],
    score,
    issues,
    canShowMargin: sourceAvailable && actual.revenue > 0 && actual.costs > 0,
  };
}

export interface OrderVehicleCostEstimate {
  estimatedCost: number;
  vehiclesUsed: number;
  vehicleDays: number;
  vehiclesWithoutCost: number;
  dataVisible: boolean;
}

export interface OrderVehicleCostEstimateRow {
  costo_mezzi_stimato?: number | null;
  mezzi_usati?: number | null;
  giorni_mezzo?: number | null;
  mezzi_senza_costo?: number | null;
  dati_mezzi_visibili?: boolean | null;
}

export function orderVehicleCostEstimate(
  row: OrderVehicleCostEstimateRow | null | undefined,
): OrderVehicleCostEstimate {
  return {
    estimatedCost: finite(row?.costo_mezzi_stimato),
    vehiclesUsed: finite(row?.mezzi_usati),
    vehicleDays: finite(row?.giorni_mezzo),
    vehiclesWithoutCost: finite(row?.mezzi_senza_costo),
    dataVisible: row?.dati_mezzi_visibili === true,
  };
}
