/**
 * Pure transformation functions for company costs data.
 * Extracted from useCompanyCostsData to improve maintainability.
 */
import { format, startOfMonth, endOfMonth, addMonths, addDays, subMonths, startOfYear, endOfYear, isWithinInterval } from "date-fns";
import { it } from "date-fns/locale";
import { calculateGrossFromNet } from "@/lib/vatUtils";
import { RECURRENCE_LABELS, COST_ID_PREFIX } from "@/lib/forecastTypes";

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

    if (pm === "50_50" || pm === "30_70") {
      rows.push({
        id: `${COST_ID_PREFIX.ORDER_ITEM_DEPOSIT}${item.id}`,
        realOrderItemId: item.id,
        name: `Acconto - ${item.name}`,
        cost_type: "variable",
        amount: Number(item.deposit_amount) || 0,
        category: "Fornitori",
        recurrence: "once",
        due_date: item.deposit_paid_date || new Date().toISOString().split("T")[0],
        is_paid: !!item.deposit_paid,
        paid_date: item.deposit_paid_date || null,
        notes: null,
        order_id: order?.id || null,
        order,
        isFromOrder: true,
        orderItemStatus: item.status,
        supplierName,
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
        due_date: item.balance_expected_date || item.balance_paid_date || new Date().toISOString().split("T")[0],
        is_paid: !!item.balance_paid,
        paid_date: item.balance_paid_date || null,
        notes: null,
        order_id: order?.id || null,
        order,
        isFromOrder: true,
        orderItemStatus: item.status,
        supplierName,
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
        due_date: item.paid_date || new Date().toISOString().split("T")[0],
        is_paid: !!item.is_paid,
        paid_date: item.paid_date || null,
        notes: null,
        order_id: order?.id || null,
        order,
        isFromOrder: true,
        orderItemStatus: item.status,
        supplierName,
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
    due_date: item.payment_date || new Date().toISOString().split("T")[0],
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

/** Transform active employees into fixed monthly salary costs */
export function buildEmployeeCosts(activeEmployees: any[]): UnifiedCost[] {
  return activeEmployees.map((emp): UnifiedCost => ({
    id: `${COST_ID_PREFIX.EMPLOYEE_SALARY}${emp.id}`,
    name: `${emp.first_name} ${emp.last_name} (stipendio)`,
    cost_type: "fixed",
    amount: Number(emp.gross_salary) || 0,
    category: "Personale",
    recurrence: "monthly",
    due_date: format(endOfMonth(new Date()), "yyyy-MM-dd"),
    is_paid: false,
    paid_date: null,
    notes: null,
    order_id: null,
    order: null,
    isFromOrder: true,
    supplierName: null,
    vat_rate: 0,
  }));
}

/** Transform commissions into unified cost format */
export function buildCommissionCosts(commissionCosts: any[]): UnifiedCost[] {
  return commissionCosts.map((item: any): UnifiedCost => ({
    id: `${COST_ID_PREFIX.COMMISSION}${item.id}`,
    name: `${item.salesperson?.first_name || ""} ${item.salesperson?.last_name || ""}`.trim() || "Venditore",
    cost_type: "variable",
    amount: Number(item.commission_amount) || 0,
    category: "Provvigioni",
    recurrence: "once",
    due_date: item.payment_expected_date || new Date().toISOString().split("T")[0],
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
    const vatRate = Number(c.vat_rate) || 0;
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
  const csv = rows.map((r) => r.map((v) => `"${v}"`).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `costi-aziendali-${format(new Date(), "yyyy-MM-dd")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
