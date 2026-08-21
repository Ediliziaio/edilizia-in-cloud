/**
 * Pure transformation functions for company costs data.
 * Extracted from useCompanyCostsData to improve maintainability.
 */
import { format, startOfMonth, endOfMonth, addMonths, addDays, isBefore, isAfter } from "date-fns";
import { escapeCsvCell } from "./csvExport";
import { it } from "date-fns/locale";
import { calculateGrossFromNet } from "@/lib/vatUtils";
import { RECURRENCE_LABELS, COST_ID_PREFIX } from "@/lib/forecastTypes";
import { calculateStoredCommissionNet } from "@/lib/commissions";

export interface UnifiedCost {
  id: string;
  realOrderItemId?: string;
  name: string;
  cost_type: "fixed" | "variable";
  amount: number;
  category: string;
  recurrence: string;
  due_date: string;
  is_paid: boolean;
  paid_date: string | null;
  notes: string | null;
  order_id: string | null;
  order: { id: string; order_code: string } | null;
  isFromOrder: boolean;
  orderItemStatus?: string;
  supplierName?: string | null;
  vat_rate?: number | null;
  supplier_id?: string;
}

/** Transform order items into unified cost format (handles split payments) */
export function buildOrderItemCosts(orderItemCosts: any[]): UnifiedCost[] {
  const rows: UnifiedCost[] = [];
  orderItemCosts.forEach((item: any) => {
    const pm = item.payment_method;
    const order = item.order ? { id: item.order.id, order_code: item.order.order_code } : null;
    const supplierName = item.supplier?.name || null;
    const supplierId = item.supplier_id || null;

    if (pm === "50_50" || pm === "30_70") {
      rows.push({
        id: `${COST_ID_PREFIX.ORDER_ITEM_DEPOSIT}${item.id}`,
        realOrderItemId: item.id,
        name: `Acconto - ${item.name}`,
        cost_type: "variable",
        amount: Number(item.deposit_amount) || 0,
        category: "Fornitori",
        recurrence: "once",
        due_date: item.deposit_expected_date || item.deposit_paid_date || "9999-12-31",
        is_paid: !!item.deposit_paid,
        paid_date: item.deposit_paid_date || null,
        notes: null,
        order_id: order?.id || null,
        order,
        isFromOrder: true,
        orderItemStatus: item.status,
        supplierName,
        supplier_id: supplierId,
        vat_rate: item.supplier?.vat_rate ?? null,
      });
      rows.push({
        id: `${COST_ID_PREFIX.ORDER_ITEM_BALANCE}${item.id}`,
        realOrderItemId: item.id,
        name: `Saldo - ${item.name}`,
        cost_type: "variable",
        amount: Number(item.balance_amount) || 0,
        category: "Fornitori",
        recurrence: "once",
        due_date: item.balance_expected_date || item.balance_paid_date || "9999-12-31",
        is_paid: !!item.balance_paid,
        paid_date: item.balance_paid_date || null,
        notes: null,
        order_id: order?.id || null,
        order,
        isFromOrder: true,
        orderItemStatus: item.status,
        supplierName,
        supplier_id: supplierId,
        vat_rate: item.supplier?.vat_rate ?? null,
      });
    } else {
      rows.push({
        id: `${COST_ID_PREFIX.ORDER_ITEM}${item.id}`,
        realOrderItemId: item.id,
        name: item.name,
        cost_type: "variable",
        amount: (Number(item.purchase_price) || 0) * (Number(item.quantity) || 1),
        category: "Fornitori",
        recurrence: "once",
        due_date: item.balance_expected_date || item.deposit_expected_date || item.paid_date || "9999-12-31",
        is_paid: !!item.is_paid,
        paid_date: item.paid_date || null,
        notes: null,
        order_id: order?.id || null,
        order,
        isFromOrder: true,
        orderItemStatus: item.status,
        supplierName,
        supplier_id: supplierId,
        vat_rate: item.supplier?.vat_rate ?? null,
      });
    }
  });
  return rows;
}

/** Transform external teams into unified cost format */
export function buildExternalTeamCosts(externalTeamCosts: any[]): UnifiedCost[] {
  return externalTeamCosts.map((item: any): UnifiedCost => ({
    id: `${COST_ID_PREFIX.EXT_TEAM}${item.id}`,
    name: item.external_team?.name || "Squadra Esterna",
    cost_type: "variable",
    amount: Number(item.total_cost) || 0,
    category: "Squadre Esterne",
    recurrence: "once",
    due_date: item.payment_date || "9999-12-31",
    is_paid: !!item.is_paid,
    paid_date: item.paid_date || null,
    notes: null,
    order_id: item.order?.id || null,
    order: item.order ? { id: item.order.id, order_code: item.order.order_code } : null,
    isFromOrder: true,
    supplierName: null,
    vat_rate: 0,
  }));
}

/**
 * Orizzonte di proiezione degli stipendi nel futuro (mesi oltre quello
 * corrente). Serve alle viste di PIANIFICAZIONE: senza, il mese prossimo
 * mostrava "-94% di costi" solo perché gli stipendi non venivano generati.
 */
export const EMPLOYEE_PROJECTION_MONTHS = 12;

/**
 * Transform active employees into fixed monthly salary costs.
 *
 * Una riga stipendio + una riga oneri INPS per ogni mese, dall'ingresso del
 * dipendente fino al mese corrente + `futureMonths` (0 = solo storico, per le
 * viste operative; EMPLOYEE_PROJECTION_MONTHS per le viste di pianificazione).
 *
 * Limiti DICHIARATI (la tabella employees non ha date di assunzione/cessazione):
 * - l'inizio è `created_at` (quando è stato inserito nel gestionale);
 * - i mesi chiusi sono PRESUNTI pagati (i pagamenti stipendi non vengono
 *   registrati singolarmente) — lo dice anche la nota sulla riga;
 * - lo stipendio attuale è applicato a tutti i mesi.
 */
export function buildEmployeeCosts(activeEmployees: any[], futureMonths = 0): UnifiedCost[] {
  const rows: UnifiedCost[] = [];
  const now = new Date();
  const horizonEnd = endOfMonth(addMonths(now, futureMonths));

  activeEmployees.forEach((emp) => {
    const salary = Number(emp.gross_salary) || 0;
    if (salary === 0) return;

    const inpsRate = Number(emp.inps_rate) || 28;
    // hire_date/termination_date arrivano dall'anagrafica HR (hr_profili.
    // data_assunzione/data_cessazione) quando compilate; il fallback resta
    // created_at (= quando è stato inserito in piattaforma).
    const hireDate = emp.hire_date ? new Date(emp.hire_date) : emp.created_at ? new Date(emp.created_at) : addMonths(now, -11);
    // Un dipendente cessato smette di costare dal mese dopo la cessazione.
    const personHorizon = emp.termination_date
      ? new Date(Math.min(horizonEnd.getTime(), endOfMonth(new Date(emp.termination_date)).getTime()))
      : horizonEnd;
    let month = startOfMonth(hireDate);

    while (!isAfter(month, personHorizon)) {
      const monthEnd = endOfMonth(month);
      const isPaid = isBefore(monthEnd, startOfMonth(now));
      const paidDate = isPaid ? format(monthEnd, "yyyy-MM-dd") : null;

      // Stipendio lordo
      rows.push({
        id: `${COST_ID_PREFIX.EMPLOYEE_SALARY}${emp.id}_${format(month, "yyyy-MM")}`,
        name: `${emp.first_name} ${emp.last_name} — stipendio lordo`,
        cost_type: "fixed",
        amount: salary,
        category: "Personale",
        recurrence: "monthly",
        due_date: format(monthEnd, "yyyy-MM-dd"),
        is_paid: isPaid,
        paid_date: paidDate,
        notes: isPaid ? "Presunto pagato a fine mese (i pagamenti stipendi non sono registrati singolarmente)" : null,
        order_id: null,
        order: null,
        isFromOrder: true,
        supplierName: null,
        vat_rate: 0,
      });

      // Oneri INPS
      rows.push({
        id: `${COST_ID_PREFIX.EMPLOYEE_SALARY}${emp.id}_inps_${format(month, "yyyy-MM")}`,
        name: `${emp.first_name} ${emp.last_name} — oneri INPS (${inpsRate}%)`,
        cost_type: "fixed",
        amount: salary * (inpsRate / 100),
        category: "Personale",
        recurrence: "monthly",
        due_date: format(monthEnd, "yyyy-MM-dd"),
        is_paid: isPaid,
        paid_date: paidDate,
        notes: `Contributi datore di lavoro ${inpsRate}%`,
        order_id: null,
        order: null,
        isFromOrder: true,
        supplierName: null,
        vat_rate: 0,
      });

      month = addMonths(month, 1);
    }
  });
  return rows;
}

/** Transform commissions into unified cost format */
export function buildCommissionCosts(commissionCosts: any[]): UnifiedCost[] {
  return commissionCosts.map((item: any): UnifiedCost => ({
    id: `${COST_ID_PREFIX.COMMISSION}${item.id}`,
    name: `${item.salesperson?.first_name || ""} ${item.salesperson?.last_name || ""}`.trim() || "Venditore",
    cost_type: "variable",
    amount: calculateStoredCommissionNet(item.commission_amount, item.deduction_amount),
    category: "Provvigioni",
    recurrence: "once",
    due_date: item.payment_expected_date || "9999-12-31",
    is_paid: !!item.is_paid,
    paid_date: item.paid_date || null,
    notes: null,
    order_id: item.order?.id || null,
    order: item.order ? { id: item.order.id, order_code: item.order.order_code } : null,
    isFromOrder: true,
    supplierName: null,
    vat_rate: 0,
  }));
}

/**
 * Costi DA PAGARE senza scadenza (due_date sentinella "9999-12-31" o assente).
 * Ogni totale di periodo li esclude per forza — non hanno una data su cui
 * cadere — quindi vanno DICHIARATI: quante righe e quanti euro restano fuori.
 * Solo i NON pagati: un costo pagato entra comunque nei totali per data di
 * pagamento, ed è lo stesso insieme del filtro "Senza scadenza" in Spese.
 */
export function computeCostiSenzaScadenza(costs: Pick<UnifiedCost, "due_date" | "amount" | "is_paid">[]): {
  count: number;
  totale: number;
} {
  let count = 0;
  let totale = 0;
  for (const c of costs) {
    if (!c.is_paid && (!c.due_date || c.due_date === "9999-12-31")) {
      count += 1;
      totale += Number(c.amount) || 0;
    }
  }
  return { count, totale };
}

/** Build dynamic categories from DB + legacy data */
export function buildDynamicCategories(
  dbCategories: string[],
  costs: any[],
  suppliers: any[],
  allOrderDerivedCosts: UnifiedCost[]
): string[] {
  const cats = new Set<string>(dbCategories);
  costs.forEach((c: any) => { if (c.category) cats.add(c.category); });
  suppliers.forEach((s: any) => { if (s.product_category) cats.add(s.product_category); });
  allOrderDerivedCosts.forEach((c) => { if (c.category) cats.add(c.category); });
  if (cats.size === 0) {
    ["Affitto", "Utenze", "Assicurazioni", "Leasing", "Trasporti", "Consulenze", "Marketing", "Software", "Tasse", "Materiali", "Altro"].forEach(c => cats.add(c));
  }
  return Array.from(cats).sort();
}

/** 12-month cost distribution (6 past + 6 future) */
export function buildMonthlyDistribution(costs: any[], allOrderDerivedCosts: UnifiedCost[]) {
  const now = new Date();
  const currentMonthStr = format(now, "yyyy-MM");
  const allRaw = [...costs, ...allOrderDerivedCosts];

  const months: { ms: Date; me: Date; key: string; label: string }[] = [];
  for (let i = -5; i <= 6; i++) {
    const ms = startOfMonth(addMonths(now, i));
    const me = endOfMonth(addMonths(now, i));
    months.push({ ms, me, key: format(ms, "yyyy-MM"), label: format(ms, "MMM yy", { locale: it }) });
  }

  const buckets = new Map<string, { fixed: number; variable: number; paidEffective: number; previsto: number; sostenuto: number }>();
  for (const m of months) {
    buckets.set(m.key, { fixed: 0, variable: 0, paidEffective: 0, previsto: 0, sostenuto: 0 });
  }

  const firstMonth = months[0].ms.getTime();
  const lastMonth = months[months.length - 1].me.getTime();

  for (const c of allRaw) {
    if (c.due_date) {
      const d = new Date(c.due_date);
      const dt = d.getTime();
      if (dt >= firstMonth && dt <= lastMonth) {
        const key = format(d, "yyyy-MM");
        const b = buckets.get(key);
        if (b) {
          const amt = Number(c.amount);
          if (c.cost_type === "fixed") b.fixed += amt; else b.variable += amt;
          b.previsto += amt;
        }
      }
    }
    if (c.is_paid && c.paid_date) {
      const pd = new Date(c.paid_date);
      const pdt = pd.getTime();
      if (pdt >= firstMonth && pdt <= lastMonth) {
        const key = format(pd, "yyyy-MM");
        const b = buckets.get(key);
        if (b) {
          const amt = Number(c.amount);
          b.paidEffective += amt;
          b.sostenuto += amt;
        }
      }
    }
  }

  return months.map(m => {
    const b = buckets.get(m.key)!;
    return {
      month: m.label,
      monthKey: m.key,
      Fissi: b.fixed,
      Variabili: b.variable,
      PagatoEffettivo: b.paidEffective,
      Totale: b.fixed + b.variable,
      Previsto: b.previsto,
      Sostenuto: b.sostenuto,
      isCurrent: m.key === currentMonthStr,
    };
  });
}

/** Sort all costs by priority (overdue → expiring → upcoming → paid) */
export function sortCostsByPriority(costs: any[]): any[] {
  const now = new Date();
  const soon = addDays(now, 7);
  return [...costs].sort((a: any, b: any) => {
    const getPriority = (c: any) => {
      if (c.is_paid) return 4;
      const d = c.due_date ? new Date(c.due_date) : null;
      if (d && d < now) return 1;
      if (d && d <= soon) return 2;
      return 3;
    };
    const pA = getPriority(a), pB = getPriority(b);
    if (pA !== pB) return pA - pB;
    const dateA = a.due_date ? new Date(a.due_date).getTime() : 0;
    const dateB = b.due_date ? new Date(b.due_date).getTime() : 0;
    return pA === 4 ? dateB - dateA : dateA - dateB;
  });
}

/** Category distribution for PieChart */
export function buildCategoryDistribution(allCostsSorted: any[]): { name: string; value: number }[] {
  const catMap = new Map<string, number>();
  allCostsSorted.forEach((c: any) => {
    const cat = c.category || "Altro";
    catMap.set(cat, (catMap.get(cat) || 0) + Number(c.amount));
  });
  const sorted = Array.from(catMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
  if (sorted.length <= 7) return sorted;
  const top6 = sorted.slice(0, 6);
  const otherValue = sorted.slice(6).reduce((s, c) => s + c.value, 0);
  return [...top6, { name: "Altro", value: otherValue }];
}

/** Export costs to CSV */
export function exportCostsToCSV(filteredCosts: any[], filteredOrderItemCosts: any[]) {
  const allForExport = [...filteredCosts, ...filteredOrderItemCosts];
  const rows = [["Nome", "Tipo", "Categoria", "Imponibile", "IVA%", "Totale Lordo", "Fornitore", "Ricorrenza", "Scadenza", "Stato", "Origine"]];
  allForExport.forEach((c: any) => {
    // `??` e non `||`: aliquota 0 esplicita = esente, NON "manca il dato"
    // (con || un costo esente prendeva l'aliquota del fornitore).
    const vatRate = Number(c.vat_rate ?? c.supplier?.vat_rate ?? 0) || 0;
    const gross = calculateGrossFromNet(Number(c.amount), vatRate);
    rows.push([
      c.name,
      c.cost_type === "fixed" ? "Fisso" : "Variabile",
      c.category || "",
      String(c.amount),
      String(vatRate),
      String(gross.grossAmount),
      c.supplier?.name || c.supplierName || "",
      RECURRENCE_LABELS[c.recurrence] || c.recurrence,
      c.due_date ? format(new Date(c.due_date), "dd/MM/yyyy") : "",
      c.is_paid ? "Pagato" : c.due_date && new Date(c.due_date) < new Date() ? "Scaduto" : "Da pagare",
      c.isFromOrder ? "Da Ordine" : "Manuale",
    ]);
  });
  const csv = rows.map((r) => r.map((v) => escapeCsvCell(v, ";")).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `costi-aziendali-${format(new Date(), "yyyy-MM-dd")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export interface BreakEvenData {
  monthlyFixedCosts: number;
  averageOrderMargin: number;
  breakEvenRevenue: number;
  breakEvenOrders: number;
  averageOrderValue: number;
  monthlyRevenue: number;
  coveragePercent: number;
  status: "above" | "near" | "below";
}

export function calculateBreakEven(
  fixedCosts: any[],
  monthlyRevenue: number,
  averageOrderValue: number = 15000,
  marginPercent: number = 30
): BreakEvenData {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const monthlyFixed = fixedCosts
    .filter((c: any) => {
      if (!c.due_date || c.due_date === "9999-12-31") return false;
      const d = new Date(c.due_date);
      return d >= monthStart && d <= monthEnd;
    })
    .reduce((s: number, c: any) => s + Number(c.amount), 0);

  const breakEvenRevenue = marginPercent > 0 ? monthlyFixed / (marginPercent / 100) : 0;
  const breakEvenOrders = averageOrderValue > 0 ? Math.ceil(breakEvenRevenue / averageOrderValue) : 0;
  const coveragePercent = breakEvenRevenue > 0 ? Math.min(100, (monthlyRevenue / breakEvenRevenue) * 100) : 100;
  const status: "above" | "near" | "below" = coveragePercent >= 100 ? "above" : coveragePercent >= 80 ? "near" : "below";

  return {
    monthlyFixedCosts: monthlyFixed,
    averageOrderMargin: marginPercent,
    breakEvenRevenue,
    breakEvenOrders,
    averageOrderValue,
    monthlyRevenue,
    coveragePercent,
    status,
  };
}
