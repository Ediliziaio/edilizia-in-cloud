import { recurrenceMultiplier } from "@/lib/forecastTypes";
import { mesiApertura } from "@/lib/controlloGestione/tempoCommessa";

export interface StructureFixedCost {
  amount: number | null;
  recurrence: string | null;
}

export interface StructureEmployee {
  id: string;
  gross_salary: number | null;
  inps_rate: number | null;
  role_type?: string | null;
  area?: string | null;
  qualifica?: string | null;
}

export interface StructureOrder {
  status?: string | null;
  percentuale_avanzamento?: number | null;
  work_start_date?: string | null;
  work_end_date?: string | null;
}

export interface CompanyStructureSnapshot {
  fixedCostsMonthly: number;
  officeSalariesMonthly: number;
  directLaborSalariesMonthly: number;
  monthlyStructure: number;
  activeOrders: number;
  monthlyPerActiveOrder: number | null;
}

export interface OrderStructureImpact {
  months: number | null;
  allocatedStructure: number | null;
  marginAfterStructure: number | null;
  marginAfterStructurePct: number | null;
}

const finite = (value: number | null | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

function normalized(value: string | null | undefined) {
  return (value ?? "").trim().toLocaleLowerCase("it-IT").replaceAll("-", "_").replaceAll(" ", "_");
}

/** L'anagrafica vince; le assegnazioni storiche sono solo un fallback. */
export function isOperationalEmployee(employee: StructureEmployee, assignedToOrders: boolean): boolean {
  const role = normalized(employee.role_type);
  const area = normalized(employee.area);
  const qualification = normalized(employee.qualifica);
  const officeRoles = ["staff_interno", "impiegato", "venditore", "commerciale", "amministrazione", "amministrativo"];
  if (officeRoles.includes(role) || ["ufficio", "amministrazione", "commerciale"].includes(area)) return false;
  if (["operaio", "employee", "capocantiere", "tecnico_cantiere"].includes(role) || area === "cantiere") return true;
  if (["operaio", "muratore", "installatore", "posatore", "elettricista", "idraulico"].some((token) => qualification.includes(token))) return true;
  return assignedToOrders;
}

/**
 * Un cantiere assorbe struttura quando risulta avviato ma non concluso.
 * L'avanzamento è la fonte principale; stato e date coprono i cantieri avviati
 * che non hanno ancora ricevuto il primo aggiornamento percentuale.
 */
export function isOrderActiveForStructure(order: StructureOrder, today: string): boolean {
  const progress = Math.min(100, Math.max(0, finite(order.percentuale_avanzamento)));
  if (progress >= 100) return false;
  if (progress > 0) return true;

  const status = (order.status ?? "").trim().toLocaleLowerCase("it-IT").replaceAll("-", "_").replaceAll(" ", "_");
  if (["in_corso", "in_lavorazione", "avviato", "attivo"].includes(status)) return true;

  if (!order.work_start_date || order.work_start_date > today) return false;
  return !order.work_end_date || order.work_end_date >= today;
}

/** Formula unica della struttura mensile, separata dai costi diretti. */
export function calculateCompanyStructureSnapshot(input: {
  fixedCosts: StructureFixedCost[];
  employees: StructureEmployee[];
  operationalEmployeeIds: Iterable<string>;
  orders: StructureOrder[];
  today: string;
}): CompanyStructureSnapshot {
  const operationalIds = new Set(input.operationalEmployeeIds);
  const fixedCostsMonthly = input.fixedCosts.reduce(
    (sum, cost) => sum + finite(cost.amount) * recurrenceMultiplier(cost.recurrence ?? "monthly"),
    0,
  );

  let officeSalariesMonthly = 0;
  let directLaborSalariesMonthly = 0;
  for (const employee of input.employees) {
    const salaryWithContributions = finite(employee.gross_salary) * (1 + finite(employee.inps_rate ?? 28) / 100);
    if (isOperationalEmployee(employee, operationalIds.has(employee.id))) directLaborSalariesMonthly += salaryWithContributions;
    else officeSalariesMonthly += salaryWithContributions;
  }

  const monthlyStructure = fixedCostsMonthly + officeSalariesMonthly;
  const activeOrders = input.orders.filter((order) => isOrderActiveForStructure(order, input.today)).length;

  return {
    fixedCostsMonthly,
    officeSalariesMonthly,
    directLaborSalariesMonthly,
    monthlyStructure,
    activeOrders,
    monthlyPerActiveOrder: monthlyStructure > 0 && activeOrders > 0
      ? monthlyStructure / activeOrders
      : null,
  };
}

/**
 * Incidenza stimata della struttura sulla singola commessa. Non modifica il
 * consuntivo: serve a leggere quanto margine diretto resta dopo il tempo.
 */
export function calculateOrderStructureImpact(input: {
  directMargin: number;
  revenue: number;
  monthlyPerActiveOrder: number | null;
  workStartDate: string | null;
  workEndDate: string | null;
  progressPercent: number | null;
  today: string;
}): OrderStructureImpact {
  if (!input.monthlyPerActiveOrder || input.monthlyPerActiveOrder <= 0) {
    return { months: null, allocatedStructure: null, marginAfterStructure: null, marginAfterStructurePct: null };
  }

  const progress = finite(input.progressPercent);
  const endedByDateWithoutProgress = progress <= 0
    && !!input.workEndDate
    && input.workEndDate <= input.today;
  const completed = progress >= 100 || endedByDateWithoutProgress;
  const months = mesiApertura(
    input.workStartDate,
    completed ? input.workEndDate : null,
    input.today,
  );
  if (months === null) {
    return { months: null, allocatedStructure: null, marginAfterStructure: null, marginAfterStructurePct: null };
  }

  const allocatedStructure = Math.max(0, months) * input.monthlyPerActiveOrder;
  const marginAfterStructure = finite(input.directMargin) - allocatedStructure;
  const marginAfterStructurePct = input.revenue > 0
    ? (marginAfterStructure / input.revenue) * 100
    : null;

  return { months, allocatedStructure, marginAfterStructure, marginAfterStructurePct };
}
