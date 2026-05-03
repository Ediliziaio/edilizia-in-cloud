import { useMemo, useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { addDays, addMonths, differenceInCalendarDays, endOfDay, format, startOfMonth, startOfYear } from "date-fns";
import type { CompanyDashboardFiltersState } from "@/components/dashboard/CompanyDashboardFilters";
import { queryKeys } from "@/lib/queryKeys";
import { getDateRange } from "@/lib/dateRangeUtils";

export interface RecentOrder {
  id: string;
  description: string;
  total_amount: number;
  created_at: string;
  customer: { first_name: string; last_name: string };
  status: { name: string; color: string } | null;
}

export interface UrgentItem {
  id: string;
  name: string;
  orderCode: string | null;
  customerName: string;
  daysLeft: number;
}

export interface CashFlow {
  // LEGACY — dato commerciale (ordinato vs pianificato)
  thisMonthIncome: number;
  thisMonthOutflow: number;
  netCashFlow: number;
  nextMonth: number;
  // NUOVI — cashflow reale (incassi + pagamenti registrati)
  realIncome?: number;       // invoice_payments del mese
  realOutflow?: number;      // company_costs is_paid del mese
  realNet?: number;          // realIncome - realOutflow
  forecastNext30d?: number;  // incassi attesi - costi pianificati 30gg
  forecastInflow?: number;
  forecastOutflow?: number;
  hasRealData?: boolean;     // true se l'azienda alimenta invoice_payments o pagamenti
}

export interface CeoStrip {
  revenueThisMonth: number;
  revenuePrevMonth: number;
  marginThisMonth: number;
  marginPrevMonth: number;
  ordersThisMonth: number;
  ordersPrevMonth: number;
}

export interface WeeklyDeadlinesData {
  receivables: Array<{ orderDescription: string; customerName: string; amount: number; expectedDate: string; daysLeft: number }>;
  companyCosts: Array<{ name: string; amount: number; dueDate: string; daysLeft: number }>;
  upcomingWorks: Array<{
    id?: string;
    orderCode: string;
    customerName: string;
    workDate: string;
    daysLeft: number;
    source?: "order" | "appointment" | "warehouse";
    kindLabel?: string;
    supplierName?: string | null;
    purchaseOrderNumber?: string | null;
    materialSummary?: string | null;
    detailTitle?: string | null;
    detailSubtitle?: string | null;
  }>;
}

export interface FinancialAlert {
  type: "warning" | "error";
  message: string;
}

export interface DashboardStats {
  totalOrders: number;
  totalCustomers: number;
  openTickets: number;
  totalRevenue: number;
  collectedRevenue: number;
  pendingRevenue: number;
  pendingOrdersCount: number;
}

type OperationalAgendaItem = WeeklyDeadlinesData["upcomingWorks"][number];

type DashboardFinancialOrderRow = {
  id: string;
  customer_id: string | null;
  created_at: string | null;
  current_status_id: string | null;
  total_amount: number | null;
  vat_rate: number | null;
  deposit_amount: number | null;
  deposit_paid: boolean | null;
  deposit_2_amount: number | null;
  deposit_2_paid: boolean | null;
  balance_amount: number | null;
  balance_paid: boolean | null;
  financing_amount: number | null;
  financing_paid: boolean | null;
};

type DashboardCostRow = {
  amount: number | null;
  due_date: string | null;
};

type DashboardOrderAgendaRow = {
  id: string;
  order_code: string | null;
  description: string | null;
  expected_date: string | null;
  work_start_date: string | null;
  work_end_date: string | null;
  warehouse_arrival_date: string | null;
  customer?: { first_name: string | null; last_name: string | null } | null;
};

type DashboardAppointmentAgendaRow = {
  id: string;
  title: string | null;
  appointment_date: string | null;
  appointment_type: string | null;
  status: string | null;
  is_completed: boolean | null;
  order_id: string | null;
  order?: {
    order_code: string | null;
    description: string | null;
    customer?: { first_name: string | null; last_name: string | null } | null;
  } | null;
  contact?: { first_name: string | null; last_name: string | null } | null;
};

type DashboardPurchaseOrderAgendaRow = {
  id: string;
  oda_number: string | null;
  expected_delivery_date: string | null;
  order_id: string | null;
  status: string | null;
  total: number | null;
  suppliers?: { name: string | null } | null;
  orders?: {
    order_code: string | null;
    description: string | null;
    customer?: { first_name: string | null; last_name: string | null } | null;
  } | null;
  purchase_order_items?: Array<{
    description: string | null;
    quantity: number | null;
    quantity_received: number | null;
    unit_of_measure: string | null;
  }> | null;
};

const EMPTY_WEEKLY_DEADLINES: WeeklyDeadlinesData = {
  receivables: [],
  companyCosts: [],
  upcomingWorks: [],
};

const WORK_APPOINTMENT_TYPES = new Set(["inizio_lavori", "fine_lavori", "posa_prova", "collaudo", "verifica_cantiere"]);

function makePersonName(person?: { first_name: string | null; last_name: string | null } | null, fallback = "Cliente") {
  return [person?.first_name, person?.last_name].filter(Boolean).join(" ").trim() || fallback;
}

function normalizeDashboardDate(value?: string | null) {
  if (!value) return null;
  return value.slice(0, 10);
}

function isDateInWindow(date: string | null, start: string, end: string) {
  return !!date && date >= start && date <= end;
}

function daysLeftFromToday(date: string) {
  return Math.max(0, differenceInCalendarDays(new Date(`${date}T00:00:00`), new Date()));
}

function getMonthKey(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function buildMonthBuckets(from: Date, to: Date) {
  const buckets: Array<{ key: string; month: string; entrate: number; uscite: number; realEntrate: number; realUscite: number }> = [];
  let cursor = startOfMonth(from);
  const end = startOfMonth(to);

  while (cursor <= end && buckets.length < 18) {
    const key = getMonthKey(cursor)!;
    const month = cursor
      .toLocaleDateString("it-IT", { month: "short", year: "2-digit" })
      .replace(".", "");
    buckets.push({ key, month, entrate: 0, uscite: 0, realEntrate: 0, realUscite: 0 });
    cursor = addMonths(cursor, 1);
  }

  return buckets;
}

/**
 * Calcola gli importi normalizzati di un ordine usando UNA singola fonte
 * di verità. Strategia (P1.1 fix):
 *
 *  - `commercialTotal` = `orders.total_amount` (campo commerciale).
 *  - `collected` = somma `order_installments.amount` con `is_paid = true`,
 *    fornita dal chiamante via `paidInstallmentsByOrder`. Se per quell'ordine
 *    non ci sono righe in `order_installments`, fallback ai flag legacy
 *    (`deposit_paid` / `deposit_2_paid` / `balance_paid` / `financing_paid`)
 *    moltiplicati per il rispettivo importo legacy, **clampato** a
 *    `commercialTotal` per non eccedere mai il totale.
 *  - `due` = `max(0, commercialTotal - collected)`.
 *
 *  Le vecchie colonne `deposit_amount/balance_amount/financing_amount` non
 *  vengono più sommate al totale: erano fonte di gonfiature 3-4× quando
 *  contenevano valori storici inconsistenti col `total_amount`.
 */
function getNormalizedOrderAmounts(
  order: DashboardFinancialOrderRow,
  paidInstallmentsByOrder?: Map<string, number>,
  hasInstallmentsByOrder?: Set<string>,
) {
  const commercialTotal = Number(order.total_amount || 0);

  let collected = 0;
  if (hasInstallmentsByOrder?.has(order.id)) {
    collected = paidInstallmentsByOrder?.get(order.id) ?? 0;
  } else {
    // Fallback legacy: usa i flag *_paid solo se un ordine non ha installments.
    const legacyPaid =
      (order.deposit_paid ? Number(order.deposit_amount || 0) : 0) +
      (order.deposit_2_paid ? Number(order.deposit_2_amount || 0) : 0) +
      (order.balance_paid ? Number(order.balance_amount || 0) : 0) +
      (order.financing_paid ? Number(order.financing_amount || 0) : 0);
    collected = legacyPaid;
  }

  // Clamp per evitare collected > commercialTotal su dati legacy inconsistenti.
  collected = Math.min(collected, commercialTotal);
  const due = Math.max(0, commercialTotal - collected);

  return { commercialTotal, collected, due };
}

function orderLabel(order: Pick<DashboardOrderAgendaRow, "order_code" | "description">) {
  return order.order_code || order.description || "Commessa";
}

export interface PrevStats {
  totalOrders: number;
  totalCustomers: number;
}

export function useCompanyDashboardData() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const [filters, setFilters] = useState<CompanyDashboardFiltersState>({
    datePreset: "year",
    dateFrom: startOfYear(new Date()),
    dateTo: endOfDay(new Date()),
    statusId: null,
  });

  const updateFilters = useCallback((partial: Partial<CompanyDashboardFiltersState>) => {
    setFilters(prev => {
      const next = { ...prev, ...partial };
      if (partial.datePreset && partial.datePreset !== "custom") {
        const range = getDateRange(partial.datePreset);
        next.dateFrom = range.from;
        next.dateTo = range.to;
      }
      return next;
    });
  }, []);

  const dateRange = useMemo(
    () => getDateRange(filters.datePreset, filters.dateFrom, filters.dateTo),
    [filters.datePreset, filters.dateFrom, filters.dateTo]
  );

  const { data: dashboardData, isLoading: isDashboardLoading, isError: isDashboardError } = useQuery({
    queryKey: queryKeys.dashboard.company(companyId, `${dateRange.from.toISOString()}-${dateRange.to.toISOString()}-${filters.statusId}`),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_dashboard_kpis", {
        p_company_id: companyId!,
        p_date_from: dateRange.from.toISOString(),
        p_date_to: dateRange.to.toISOString(),
        p_status_id: filters.statusId || undefined,
      });

      if (error) throw error;

      const result = data as unknown as {
        stats: DashboardStats;
        prevStats: PrevStats;
        recentOrders: RecentOrder[];
        cashFlow: CashFlow;
        ceoStrip: CeoStrip;
        urgentItems: UrgentItem[];
        financialAlerts: FinancialAlert[];
        weeklyDeadlines: WeeklyDeadlinesData;
        monthlyBalance: { month: string; entrate: number; uscite: number }[];
        revenueYTD: { month: string; revenue: number }[];
        agingReceivables: { overdue: number; thisWeek: number; thisMonth: number; future: number };
      };

      return {
        stats: result.stats,
        prevStats: result.prevStats,
        recentOrders: result.recentOrders || [],
        cashFlow: result.cashFlow,
        ceoStrip: result.ceoStrip,
        urgentItems: result.urgentItems || [],
        financialAlerts: result.financialAlerts || [],
        weeklyDeadlines: result.weeklyDeadlines,
        monthlyBalance: result.monthlyBalance || [],
        revenueYTD: result.revenueYTD || [],
        agingReceivables: result.agingReceivables,
      };
    },
    enabled: !!companyId,
    staleTime: 3 * 60 * 1000,
  });

  const { data: managementFinancials } = useQuery({
    queryKey: [
      "company-dashboard-management-financials",
      companyId,
      dateRange.from.toISOString(),
      dateRange.to.toISOString(),
      filters.statusId,
    ],
    queryFn: async () => {
      if (!companyId) {
        return {
          stats: { totalOrders: 0, totalCustomers: 0, totalRevenue: 0, collectedRevenue: 0, pendingRevenue: 0, pendingOrdersCount: 0 },
          monthlyBalance: [],
        };
      }

      let ordersQuery = supabase
        .from("orders")
        .select(`
          id,
          customer_id,
          created_at,
          current_status_id,
          total_amount,
          vat_rate,
          deposit_amount,
          deposit_paid,
          deposit_2_amount,
          deposit_2_paid,
          balance_amount,
          balance_paid,
          financing_amount,
          financing_paid
        `)
        .eq("company_id", companyId)
        .gte("created_at", dateRange.from.toISOString())
        .lte("created_at", dateRange.to.toISOString());

      if (filters.statusId) ordersQuery = ordersQuery.eq("current_status_id", filters.statusId);

      const costsQuery = supabase
        .from("company_costs")
        .select("amount, due_date")
        .eq("company_id", companyId)
        .gte("due_date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("due_date", format(dateRange.to, "yyyy-MM-dd"));

      const [ordersResult, costsResult] = await Promise.all([ordersQuery, costsQuery]);

      if (ordersResult.error) throw ordersResult.error;
      if (costsResult.error) throw costsResult.error;

      const orders = (ordersResult.data || []) as DashboardFinancialOrderRow[];
      const costs = (costsResult.data || []) as DashboardCostRow[];

      // Carica le rate dagli order_installments solo per gli ordini in finestra.
      const orderIds = orders.map((o) => o.id);
      const paidInstallmentsByOrder = new Map<string, number>();
      const hasInstallmentsByOrder = new Set<string>();
      if (orderIds.length > 0) {
        const { data: installments, error: instErr } = await supabase
          .from("order_installments")
          .select("order_id, amount, is_paid")
          .in("order_id", orderIds);
        if (instErr) throw instErr;
        for (const inst of installments ?? []) {
          if (!inst.order_id) continue;
          hasInstallmentsByOrder.add(inst.order_id);
          if (inst.is_paid) {
            const prev = paidInstallmentsByOrder.get(inst.order_id) ?? 0;
            paidInstallmentsByOrder.set(inst.order_id, prev + Number(inst.amount || 0));
          }
        }
      }

      const monthBuckets = buildMonthBuckets(dateRange.from, dateRange.to);
      const byMonth = new Map(monthBuckets.map((bucket) => [bucket.key, bucket]));
      const customerIds = new Set<string>();

      let totalRevenue = 0;
      let collectedRevenue = 0;
      let pendingRevenue = 0;
      let pendingOrdersCount = 0;

      for (const order of orders) {
        if (order.customer_id) customerIds.add(order.customer_id);
        const amounts = getNormalizedOrderAmounts(order, paidInstallmentsByOrder, hasInstallmentsByOrder);
        totalRevenue += amounts.commercialTotal;
        collectedRevenue += amounts.collected;
        pendingRevenue += amounts.due;
        if (amounts.due > 0.01) pendingOrdersCount += 1;

        const month = byMonth.get(getMonthKey(order.created_at) || "");
        if (month) {
          month.entrate += amounts.commercialTotal;
          month.realEntrate += amounts.collected;
        }
      }

      for (const cost of costs) {
        const month = byMonth.get(getMonthKey(cost.due_date) || "");
        if (month) {
          month.uscite += Number(cost.amount || 0);
        }
      }

      return {
        stats: {
          totalOrders: orders.length,
          totalCustomers: customerIds.size,
          totalRevenue,
          collectedRevenue,
          pendingRevenue,
          pendingOrdersCount,
        },
        monthlyBalance: monthBuckets.map(({ key: _key, ...bucket }) => bucket),
      };
    },
    enabled: !!companyId,
    staleTime: 3 * 60 * 1000,
  });

  // P3.1 fix — l'agenda ora rispetta il filtro periodo della dashboard.
  // Per i preset rivolti al passato (Oggi/Ieri/7g/30g/Mese/Anno/Sempre)
  // usiamo `[from, to]` del filtro stesso. Per "Personalizzato" idem.
  // Quando il preset è "Sempre" (range enorme), limitiamo a 90 giorni
  // futuri per evitare di caricare migliaia di righe inutili.
  const agendaRange = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    const fromStr = format(dateRange.from, "yyyy-MM-dd");
    const toStr = format(dateRange.to, "yyyy-MM-dd");
    // Preset "all" → mostra prossimi 90 giorni (solo agenda futura).
    if (filters.datePreset === "all") {
      return { from: today, to: format(addDays(new Date(), 90), "yyyy-MM-dd") };
    }
    // Preset "passato" puro (oggi/ieri/7g/30g) → estendi anche ai prossimi
    // 31 giorni perché l'agenda operativa è inerentemente forward-looking.
    if (toStr <= today) {
      return { from: today, to: format(addDays(new Date(), 31), "yyyy-MM-dd") };
    }
    return { from: fromStr < today ? today : fromStr, to: toStr };
  }, [dateRange.from, dateRange.to, filters.datePreset]);

  const { data: operationalAgenda = [] } = useQuery({
    queryKey: ["company-dashboard-operational-agenda", companyId, agendaRange.from, agendaRange.to],
    queryFn: async () => {
      if (!companyId) return [];

      const [ordersResult, appointmentsResult, purchaseOrdersResult] = await Promise.all([
        supabase
          .from("orders")
          .select(`
            id,
            order_code,
            description,
            expected_date,
            work_start_date,
            work_end_date,
            warehouse_arrival_date,
            customer:profiles!orders_customer_id_fkey(first_name, last_name)
          `)
          .eq("company_id", companyId)
          .or(`work_start_date.lte.${agendaRange.to},expected_date.lte.${agendaRange.to},warehouse_arrival_date.lte.${agendaRange.to}`)
          .or(`work_end_date.gte.${agendaRange.from},work_start_date.gte.${agendaRange.from},expected_date.gte.${agendaRange.from},warehouse_arrival_date.gte.${agendaRange.from}`)
          .order("work_start_date", { ascending: true })
          .limit(300),
        supabase
          .from("appointments")
          .select(`
            id,
            title,
            appointment_date,
            appointment_type,
            status,
            is_completed,
            order_id,
            order:orders!appointments_order_id_fkey(order_code, description, customer:profiles!orders_customer_id_fkey(first_name, last_name)),
            contact:marketing_contacts!appointments_contact_id_fkey(first_name, last_name)
          `)
          .eq("company_id", companyId)
          .gte("appointment_date", agendaRange.from)
          .lte("appointment_date", agendaRange.to)
          .order("appointment_date", { ascending: true })
          .limit(300),
        supabase
          .from("purchase_orders")
          .select(`
            id,
            oda_number,
            expected_delivery_date,
            order_id,
            status,
            total,
            suppliers(name),
            orders(order_code, description, customer:profiles!orders_customer_id_fkey(first_name, last_name)),
            purchase_order_items(description, quantity, quantity_received, unit_of_measure)
          `)
          .eq("company_id", companyId)
          .gte("expected_delivery_date", agendaRange.from)
          .lte("expected_delivery_date", agendaRange.to)
          .not("expected_delivery_date", "is", null)
          .order("expected_delivery_date", { ascending: true })
          .limit(200),
      ]);

      if (ordersResult.error) throw ordersResult.error;
      if (appointmentsResult.error) throw appointmentsResult.error;
      if (purchaseOrdersResult.error) throw purchaseOrdersResult.error;

      const items: OperationalAgendaItem[] = [];
      const orders = (ordersResult.data || []) as DashboardOrderAgendaRow[];
      const appointments = (appointmentsResult.data || []) as DashboardAppointmentAgendaRow[];
      const purchaseOrders = (purchaseOrdersResult.data || []) as unknown as DashboardPurchaseOrderAgendaRow[];
      const warehouseEventKeys = new Set<string>();

      for (const purchaseOrder of purchaseOrders) {
        const deliveryDate = normalizeDashboardDate(purchaseOrder.expected_delivery_date);
        if (!deliveryDate) continue;

        const order = purchaseOrder.orders;
        const supplierName = purchaseOrder.suppliers?.name || null;
        const customerName = makePersonName(order?.customer || null);
        const orderLabelText = order
          ? orderLabel({ order_code: order.order_code, description: order.description })
          : purchaseOrder.oda_number || "Ordine fornitore";
        const materialRows = purchaseOrder.purchase_order_items ?? [];
        const materialSummary = materialRows.length > 0
          ? materialRows
              .slice(0, 3)
              .map((row) => {
                const remaining = Math.max(0, Number(row.quantity || 0) - Number(row.quantity_received || 0));
                const quantity = remaining > 0 ? remaining : Number(row.quantity || 0);
                const unit = row.unit_of_measure ? ` ${row.unit_of_measure}` : "";
                return `${quantity || 1}${unit} ${row.description || "materiale"}`.trim();
              })
              .join(" · ")
          : null;
        const extraRows = Math.max(0, materialRows.length - 3);

        if (purchaseOrder.order_id) {
          warehouseEventKeys.add(`${purchaseOrder.order_id}-${deliveryDate}`);
        }

        items.push({
          id: `purchase-order-warehouse-${purchaseOrder.id}`,
          orderCode: purchaseOrder.oda_number || orderLabelText,
          customerName: customerName || supplierName || "Fornitore",
          workDate: deliveryDate,
          daysLeft: daysLeftFromToday(deliveryDate),
          source: "warehouse",
          kindLabel: supplierName ? `Arrivo da ${supplierName}` : "Arrivo merce",
          supplierName,
          purchaseOrderNumber: purchaseOrder.oda_number,
          materialSummary: materialSummary ? `${materialSummary}${extraRows > 0 ? ` · +${extraRows} righe` : ""}` : "Materiali non dettagliati nell'ODA",
          detailTitle: materialRows[0]?.description || purchaseOrder.oda_number || "Merce in arrivo",
          detailSubtitle: [supplierName, orderLabelText].filter(Boolean).join(" · "),
        });
      }

      for (const order of orders) {
        const customerName = makePersonName(order.customer);
        const label = orderLabel(order);
        const workStart = normalizeDashboardDate(order.work_start_date);
        const workEnd = normalizeDashboardDate(order.work_end_date) || workStart;
        const expectedDate = normalizeDashboardDate(order.expected_date);
        const warehouseDate = normalizeDashboardDate(order.warehouse_arrival_date);

        if (workStart && workEnd && workStart <= agendaRange.to && workEnd >= agendaRange.from) {
          const activeOrNextWorkDate = workStart <= agendaRange.from && workEnd >= agendaRange.from ? agendaRange.from : workStart;
          if (isDateInWindow(activeOrNextWorkDate, agendaRange.from, agendaRange.to)) {
            items.push({
              id: `order-work-${order.id}`,
              orderCode: label,
              customerName,
              workDate: activeOrNextWorkDate,
              daysLeft: daysLeftFromToday(activeOrNextWorkDate),
              source: "order",
              kindLabel: workEnd && workEnd !== activeOrNextWorkDate ? "Lavori in corso" : "Inizio lavori",
            });
          }
        }

        if (isDateInWindow(expectedDate, agendaRange.from, agendaRange.to) && expectedDate !== workStart) {
          items.push({
            id: `order-posa-${order.id}`,
            orderCode: label,
            customerName,
            workDate: expectedDate!,
            daysLeft: daysLeftFromToday(expectedDate!),
            source: "order",
            kindLabel: "Posa prevista",
          });
        }

        if (
          isDateInWindow(warehouseDate, agendaRange.from, agendaRange.to) &&
          !warehouseEventKeys.has(`${order.id}-${warehouseDate}`)
        ) {
          items.push({
            id: `order-warehouse-${order.id}`,
            orderCode: label,
            customerName,
            workDate: warehouseDate!,
            daysLeft: daysLeftFromToday(warehouseDate!),
            source: "warehouse",
            kindLabel: "Arrivo materiali",
            materialSummary: "Data merce impostata sulla commessa, ma senza ODA o righe materiale collegate.",
            detailTitle: "Merce in arrivo",
            detailSubtitle: [label, customerName].filter(Boolean).join(" · "),
          });
        }
      }

      for (const appointment of appointments) {
        const appointmentDate = normalizeDashboardDate(appointment.appointment_date);
        if (!appointmentDate) continue;
        const status = (appointment.status || "").toLowerCase();
        if (["cancelled", "canceled", "annullato", "annullata"].includes(status)) continue;

        const customerName = makePersonName(appointment.order?.customer || appointment.contact);
        const linkedOrderLabel = appointment.order
          ? orderLabel({ order_code: appointment.order.order_code, description: appointment.order.description })
          : null;
        const isWorkAppointment = WORK_APPOINTMENT_TYPES.has(appointment.appointment_type || "");

        items.push({
          id: `appointment-${appointment.id}`,
          orderCode: linkedOrderLabel || appointment.title || "Appuntamento",
          customerName,
          workDate: appointmentDate,
          daysLeft: daysLeftFromToday(appointmentDate),
          source: "appointment",
          kindLabel: isWorkAppointment ? "Appuntamento lavori" : "Appuntamento",
        });
      }

      const byKey = new Map<string, OperationalAgendaItem>();
      for (const item of items) {
        const key = item.id || `${item.source}-${item.orderCode}-${item.workDate}-${item.kindLabel}`;
        if (!byKey.has(key)) byKey.set(key, item);
      }

      return Array.from(byKey.values()).sort((a, b) => {
        if (a.daysLeft !== b.daysLeft) return a.daysLeft - b.daysLeft;
        return a.workDate.localeCompare(b.workDate);
      });
    },
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
  });

  const weeklyDeadlines = useMemo<WeeklyDeadlinesData>(() => {
    const current = dashboardData?.weeklyDeadlines ?? EMPTY_WEEKLY_DEADLINES;
    const byKey = new Map<string, OperationalAgendaItem>();

    for (const item of current.upcomingWorks ?? []) {
      const date = normalizeDashboardDate(item.workDate);
      if (!date) continue;
      byKey.set(item.id || `rpc-${item.orderCode}-${date}-${item.kindLabel || "lavoro"}`, {
        ...item,
        workDate: date,
        daysLeft: Number.isFinite(item.daysLeft) ? item.daysLeft : daysLeftFromToday(date),
        source: item.source || "order",
        kindLabel: item.kindLabel || "Lavoro",
        supplierName: item.supplierName ?? null,
        purchaseOrderNumber: item.purchaseOrderNumber ?? null,
        materialSummary: item.materialSummary ?? null,
        detailTitle: item.detailTitle ?? null,
        detailSubtitle: item.detailSubtitle ?? null,
      });
    }

    for (const item of operationalAgenda) {
      byKey.set(item.id || `${item.source}-${item.orderCode}-${item.workDate}-${item.kindLabel}`, item);
    }

    return {
      receivables: current.receivables ?? [],
      companyCosts: current.companyCosts ?? [],
      upcomingWorks: Array.from(byKey.values())
        .sort((a, b) => {
          if (a.daysLeft !== b.daysLeft) return a.daysLeft - b.daysLeft;
          return a.workDate.localeCompare(b.workDate);
        })
        .slice(0, 80),
    };
  }, [dashboardData?.weeklyDeadlines, operationalAgenda]);

  const rpcStats = dashboardData?.stats ?? {
    totalOrders: 0,
    totalCustomers: 0,
    openTickets: 0,
    totalRevenue: 0,
    collectedRevenue: 0,
    pendingRevenue: 0,
    pendingOrdersCount: 0,
  };

  const stats: DashboardStats = managementFinancials
    ? {
        ...rpcStats,
        totalOrders: managementFinancials.stats.totalOrders,
        totalCustomers: managementFinancials.stats.totalCustomers,
        totalRevenue: managementFinancials.stats.totalRevenue,
        collectedRevenue: managementFinancials.stats.collectedRevenue,
        pendingRevenue: managementFinancials.stats.pendingRevenue,
        pendingOrdersCount: managementFinancials.stats.pendingOrdersCount,
      }
    : rpcStats;

  return {
    companyId,
    filters,
    updateFilters,
    dashboardData,
    // P2.3 fix — la condizione precedente `!companyId && isDashboardLoading`
    // era sempre false quando companyId era valorizzato → skeleton dead.
    isLoading: !!companyId && isDashboardLoading,
    isError: isDashboardError && !managementFinancials,
    stats,
    prevStats: dashboardData?.prevStats ?? { totalOrders: 0, totalCustomers: 0 },
    recentOrders: dashboardData?.recentOrders ?? [],
    cashFlow: dashboardData?.cashFlow ?? {
      thisMonthIncome: 0, thisMonthOutflow: 0, netCashFlow: 0, nextMonth: 0,
      realIncome: 0, realOutflow: 0, realNet: 0, forecastNext30d: 0,
      forecastInflow: 0, forecastOutflow: 0, hasRealData: false,
    },
    ceoStrip: dashboardData?.ceoStrip ?? { revenueThisMonth: 0, revenuePrevMonth: 0, marginThisMonth: 0, marginPrevMonth: 0, ordersThisMonth: 0, ordersPrevMonth: 0 },
    urgentItems: dashboardData?.urgentItems ?? [],
    financialAlerts: dashboardData?.financialAlerts ?? [],
    weeklyDeadlines,
    monthlyBalance: managementFinancials?.monthlyBalance ?? dashboardData?.monthlyBalance ?? [],
    revenueYTD: dashboardData?.revenueYTD ?? [],
    agingReceivables: dashboardData?.agingReceivables ?? { overdue: 0, thisWeek: 0, thisMonth: 0, future: 0 },
  };
}
