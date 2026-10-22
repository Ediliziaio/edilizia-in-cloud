import { isLateWork, scheduledMonthFlows, registeredCostAmount, upcomingWorkDeliveries } from "@/lib/cruscottoMetrics";
import { useCruscottoWorkOrders } from "@/hooks/useCruscottoWorkOrders";
import { readAllOrderRows } from "@/lib/orders/listScope";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { loadArchivedOrderIds, excludeArchivedOrders } from "@/lib/orders/archivedOrderScope";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useMemo, useCallback } from "react";
import { subDays, format, addDays, differenceInCalendarDays, startOfDay } from "date-fns";
import type { DashboardStats } from "@/hooks/useMarketingDashboard";
import { getDateRange } from "@/lib/dateRangeUtils";
import { safeNumber } from "@/lib/numberUtils";
import { queryKeys } from "@/lib/queryKeys";
import { idABlocchi, margineCommesseNelPeriodo, type RigaMargineCommessa } from "@/lib/cruscottoMargine";

// Re-export for backward compatibility with existing consumers
export { safeNumber } from "@/lib/numberUtils";

export type CruscottoDatePreset = "today" | "yesterday" | "last7" | "last30" | "month" | "quarter" | "custom";

export interface CruscottoFiltersState {
  datePreset: CruscottoDatePreset;
  dateFrom: Date;
  dateTo: Date;
  assignedUserIds: string[];
  sources: string[];
  pipelineId: string | null;
  statusId: string | null;
}

/** Scaduto verso i clienti per età (rate della finanziaria escluse), IVA inclusa. */
export interface ScadutoPerEta {
  fasce: Array<{ etichetta: string; importo: number; rate: number }>;
  totale: number;
  rate: number;
  /** giorni medi di ritardo, pesati sull'importo */
  ritardoMedio: number | null;
}

export function scadutoPerEta(rate: Array<{ amount: number; expected_date: string | null; finanziamento: boolean }>, oggi: string): ScadutoPerEta {
  const fasce = [
    { etichetta: "fino a 30 giorni", max: 30, importo: 0, rate: 0 },
    { etichetta: "31–60 giorni", max: 60, importo: 0, rate: 0 },
    { etichetta: "61–90 giorni", max: 90, importo: 0, rate: 0 },
    { etichetta: "oltre 90 giorni", max: Infinity, importo: 0, rate: 0 },
  ];
  const giornoOggi = new Date(`${oggi}T12:00:00`).getTime();
  let totale = 0, quante = 0, pesoGiorni = 0;
  for (const r of rate) {
    const importo = safeNumber(r.amount);
    if (importo <= 0 || r.finanziamento || !r.expected_date || r.expected_date >= oggi) continue;
    const giorni = Math.round((giornoOggi - new Date(`${r.expected_date}T12:00:00`).getTime()) / 86_400_000);
    const fascia = fasce.find((f) => giorni <= f.max)!;
    fascia.importo += importo;
    fascia.rate += 1;
    totale += importo;
    quante += 1;
    pesoGiorni += giorni * importo;
  }
  return {
    fasce: fasce.map(({ etichetta, importo, rate }) => ({ etichetta, importo, rate })),
    totale,
    rate: quante,
    ritardoMedio: totale > 0 ? Math.round(pesoGiorni / totale) : null,
  };
}

export interface OperationsData {
  activeOrders: number;
  completedOrders?: number;
  supportOrders?: number;
  totalOrders?: number;
  lateOrders: number;
  openTickets: number;
  overduePayments: number;
  overdueAmount: number;
}

export interface FinanceData {
  revenueThisMonth: number;
  revenuePrevMonth: number;
  marginThisMonth: number;
  marginPrevMonth: number;
  cashFlowNet: number;
  thisMonthIncome: number;
  thisMonthOutflow: number;
  pendingRevenue: number;
  supplierDebt: number;
  collectedThisMonth?: number | null;
  /** incassato nel periodo del filtro e nel periodo precedente (stessa durata), IVA inclusa */
  collectedInPeriod?: number;
  collectedPrevPeriod?: number;
  priorReceivables?: number;
  priorPayables?: number;
  collectedUndatedCount?: number;
  costsMissingVatCount?: number;
}

export interface WeeklyAgendaData {
  incomingPayments: number;
  incomingPaymentsCount: number;
  dueCosts: number;
  dueCostsCount: number;
  deliveries: number;
  appointments: number;
}

export interface TodayData {
  leadsToday: number;
  appointmentsToday: number;
  overdueAmount: number;
  overdueCount: number;
  suppliersDueAmount: number;
  suppliersDue: Array<{ id: string; name: string; amount: number; due_date: string; category?: string }>;
  revenueInRange: number;
  collectedInRange: number;
  costsPaidInRange: number;
}

export interface CashFlowForecastData {
  incoming30: number;
  incoming60: number;
  incoming90: number;
  monthRevenue: number;
  quarterRevenue: number;
  ytdRevenue: number;
}

export interface CompanyTargets {
  monthly_revenue_target: number | null;
  monthly_orders_target: number | null;
  alert_late_orders_threshold: number;
  alert_open_tickets_threshold: number;
  alert_margin_min_pct: number;
  alert_runway_days_warning: number;
}

interface InstallmentRow {
  id: string;
  order_id: string;
  amount: number;
  expected_date: string | null;
  finanziamento: boolean;
}

interface OrderCostRow {
  id: string;
  total_amount: number | null;
}

type SupabaseQueryError = { message: string } | null | undefined;

function throwIfSupabaseError(...errors: SupabaseQueryError[]) {
  const error = errors.find(Boolean);
  if (error) throw error;
}

/** Le rate da incassare con la regola della scheda commessa (`public.rate_da_incassare`). */
async function leggiRateDaIncassare(companyId: string): Promise<InstallmentRow[]> {
  // La regola della scheda commessa calcolata dal database: piani storici compresi, mai oltre il totale.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("cruscotto_rate_da_incassare", { p_company_id: companyId });
  if (error) throw error;
  return ((data ?? []) as Array<{ id: string; order_id: string; amount: number | string; expected_date: string | null; finanziamento: boolean }>)
    .map((r) => ({ id: r.id, order_id: r.order_id, amount: safeNumber(r.amount), expected_date: r.expected_date, finanziamento: !!r.finanziamento }));
}

export function useCruscottoData() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<CruscottoFiltersState>({
    datePreset: "last30",
    dateFrom: subDays(new Date(), 30),
    dateTo: new Date(),
    assignedUserIds: [],
    sources: [],
    pipelineId: null,
    statusId: null,
  });

  const dateRange = useMemo(() => getDateRange(filters.datePreset, filters.dateFrom, filters.dateTo), [filters.datePreset, filters.dateFrom, filters.dateTo]);
  // Il periodo in giorni di calendario italiani, e il precedente della stessa durata.
  // In giorni, non in millisecondi: col cambio dell'ora (25 ottobre) una
  // durata in millisecondi spostava l'inizio del periodo precedente di un giorno.
  const periodoGiorni = useMemo(() => {
    const giorni = differenceInCalendarDays(dateRange.to, dateRange.from) + 1;
    return {
      da: format(dateRange.from, "yyyy-MM-dd"),
      a: format(dateRange.to, "yyyy-MM-dd"),
      prevDa: format(subDays(dateRange.from, giorni), "yyyy-MM-dd"),
      prevA: format(subDays(dateRange.from, 1), "yyyy-MM-dd"),
      giorni,
    };
  }, [dateRange]);

  // Marketing data from RPC
  const { data: marketingData, isLoading: marketingLoading, error: marketingError } = useQuery({
    queryKey: queryKeys.cruscotto.marketing(companyId, dateRange.from.toISOString(), dateRange.to.toISOString(), filters.assignedUserIds, filters.sources, filters.pipelineId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_marketing_dashboard_stats", {
        p_company_id: companyId!,
        p_date_from: dateRange.from.toISOString(),
        p_date_to: dateRange.to.toISOString(),
        p_assigned_user_ids: filters.assignedUserIds.length > 0 ? filters.assignedUserIds : null,
        p_sources: filters.sources.length > 0 ? filters.sources : null,
        p_pipeline_id: filters.pipelineId,
      });
      if (error) throw error;
      return data as unknown as DashboardStats;
    },
    enabled: !!companyId,
    staleTime: 120_000,
  });

  // Installments — fires independently, no waterfall
  const rateQueryKey = [...queryKeys.cruscotto.installments(companyId), "regola-scheda-commessa-v2"];
  const leggiRate = useCallback(() => queryClient.fetchQuery({
    queryKey: rateQueryKey,
    queryFn: () => leggiRateDaIncassare(companyId!),
    staleTime: 120_000,
  }), [queryClient, companyId]); // eslint-disable-line react-hooks/exhaustive-deps
  const { data: paymentsData, isLoading: paymentsLoading, error: paymentsError } = useQuery({
    queryKey: rateQueryKey,
    queryFn: () => leggiRateDaIncassare(companyId!),
    enabled: !!companyId,
    staleTime: 120_000,
  });

  const workQuery = useCruscottoWorkOrders(companyId);
  const { data: ticketCount = 0, isLoading: opsLoading, error: opsError } = useQuery({
    queryKey: [...queryKeys.cruscotto.operations(companyId, filters.statusId), "tickets-non-risolti-v3"],
    enabled: !!companyId,
    staleTime: 120_000,
    queryFn: async () => {
      // aperti = non ancora risolti né chiusi («in lavorazione» compreso), come la Dashboard Gestione
      const { count, error } = await supabase.from("tickets").select("id", { count: "exact", head: true })
        .eq("company_id", companyId!).not("status", "in", "(risolto,chiuso,annullato)");
      if (error) throw error;
      return count ?? 0;
    },
  });

  const monthStart = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd");
  const todayDate = format(new Date(), "yyyy-MM-dd");
  const collectionsQuery = useQuery({
    queryKey: ["cruscotto", "recorded-income-v1", companyId, monthStart, todayDate],
    enabled: !!companyId,
    staleTime: 120_000,
    queryFn: async () => {
      if (!companyId) throw new Error("Azienda non selezionata");
      // Incassato del mese dal database: il saldo pagato conta per il suo residuo, come nella scheda.
      const [incassato, undated] = await Promise.all([
        (supabase as any).rpc("incassato_rate_periodo", { p_da: monthStart, p_a: todayDate }) as Promise<{ data: number | null; error: unknown }>,
        supabase.from("order_installments").select("id, order:orders!inner(company_id)", { count: "exact", head: true })
          .eq("order.company_id", companyId!).eq("is_paid", true).is("paid_date", null),
      ]);
      if (incassato.error) throw incassato.error;
      if (undated.error) throw undated.error;
      return { amount: safeNumber(incassato.data), undated: undated.count ?? 0 };
    },
  });

  // Merge ops + payments via useMemo (no waterfall)
  const opsData = useMemo<OperationsData>(() => {
    const open = (workQuery.data ?? []).filter(o => o.work_state === "open" && (!filters.statusId || o.current_status_id === filters.statusId));
    const base = { totalOrders: workQuery.data?.length ?? 0, completedOrders: (workQuery.data ?? []).filter(o => o.work_state === "completed").length, supportOrders: (workQuery.data ?? []).filter(o => o.work_state === "support").length, activeOrders: open.length, lateOrders: open.filter(o => isLateWork(o)).length, openTickets: ticketCount };
    const todayStr = format(new Date(), "yyyy-MM-dd");
    let overduePayments = 0;
    let overdueAmount = 0;
    paymentsData?.forEach((inst) => {
      const amount = safeNumber(inst.amount);
      // La rata della finanziaria la paga la banca: non è un credito scaduto verso il cliente.
      if (amount > 0 && !inst.finanziamento && inst.expected_date && inst.expected_date < todayStr) {
        overduePayments++;
        overdueAmount += amount;
      }
    });
    return { ...base, overduePayments, overdueAmount };
  }, [workQuery.data, ticketCount, filters.statusId, paymentsData]);

  // Le stesse rate dello «Scaduto da incassare» in cima, divise per età
  const scaduto = useMemo(() => scadutoPerEta(paymentsData ?? [], format(new Date(), "yyyy-MM-dd")), [paymentsData]);

  // Finance data
  const { data: rawFinanceData, isLoading: financeLoading, error: financeError } = useQuery({
    queryKey: [...queryKeys.cruscotto.finance(companyId, dateRange.from.toISOString(), dateRange.to.toISOString()), "scheduled-month-v2"],
    queryFn: async () => {
      const dateFromStr = dateRange.from.toISOString();
      const dateToStr = dateRange.to.toISOString();
      const prevFromStr = startOfDay(subDays(dateRange.from, periodoGiorni.giorni)).toISOString();
      const prevToStr = new Date(startOfDay(dateRange.from).getTime() - 1).toISOString();

      const incassatoTra = async (da: string, a: string) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any).rpc("incassato_rate_periodo", { p_da: da, p_a: a });
        if (error) throw error;
        return safeNumber(data);
      };
      const [currentOrdersRes, prevOrdersRes, costsRes, collectedInPeriod, collectedPrevPeriod] = await Promise.all([
        readAllOrderRows<OrderCostRow>((from, to) => supabase.from("orders")
          .select("id, total_amount")
          .eq("company_id", companyId!)
          .is("deleted_at", null)
          .gte("created_at", dateFromStr).lte("created_at", dateToStr)
          .order("id").range(from, to)),
        readAllOrderRows<OrderCostRow>((from, to) => supabase.from("orders")
          .select("id, total_amount")
          .eq("company_id", companyId!)
          .is("deleted_at", null)
          .gte("created_at", prevFromStr).lte("created_at", prevToStr)
          .order("id").range(from, to)),
        readAllOrderRows<{amount: number; due_date: string | null; is_paid: boolean; vat_rate: number | null}>((from, to) => supabase.from("company_costs").select("id, amount, due_date, is_paid, vat_rate")
          .eq("company_id", companyId!).eq("is_paid", false).order("id").range(from, to)),
        // Incassato con la regola della scheda commessa (dal database), nel periodo e nel precedente
        incassatoTra(periodoGiorni.da, periodoGiorni.a),
        incassatoTra(periodoGiorni.prevDa, periodoGiorni.prevA),
      ]);

      // Margine dalla vista condivisa v_ordine_marginalita, sulle sole commesse
      // del periodo (quelle lette sopra, non cestinate): la vista non filtra il cestino.
      const marginiDi = async (orders: OrderCostRow[]): Promise<RigaMargineCommessa[]> => {
        const righe: RigaMargineCommessa[] = [];
        for (const blocco of idABlocchi(orders.map(o => o.id))) {
          const { data, error } = await supabase.from("v_ordine_marginalita")
            .select("id, margine, preventivo_totale, variazioni_approvate")
            .eq("company_id", companyId!).in("id", blocco);
          if (error) throw error;
          righe.push(...(data ?? []));
        }
        return righe;
      };
      const [marginiCorrenti, marginiPrecedenti] = await Promise.all([marginiDi(currentOrdersRes), marginiDi(prevOrdersRes)]);

      // Venduto = contratto più varianti approvate, come il preventivo totale della scheda commessa.
      const calc = (orders: OrderCostRow[], margini: Array<RigaMargineCommessa & { variazioni_approvate?: number | null }>) => ({
        revenue: orders.reduce((s, o) => s + safeNumber(o.total_amount), 0)
          + margini.reduce((s, m) => s + safeNumber(m.variazioni_approvate), 0),
        margin: margineCommesseNelPeriodo(margini),
      });

      const curr = calc(currentOrdersRes, marginiCorrenti);
      const prev = calc(prevOrdersRes, marginiPrecedenti);

      return {
        revenueThisMonth: curr.revenue,
        revenuePrevMonth: prev.revenue,
        marginThisMonth: curr.margin,
        marginPrevMonth: prev.margin,
        costs: costsRes,
        supplierDebt: costsRes.reduce((sum, cost) => sum + registeredCostAmount(cost), 0),
        collectedInPeriod,
        collectedPrevPeriod,
      };
    },
    enabled: !!companyId,
    staleTime: 120_000,
  });

  // Financial history remains included even when a job is archived. Operational counts exclude it.
  const financeData = useMemo<FinanceData>(() => {
    const base = rawFinanceData;
    // Crediti arretrati senza la rata della finanziaria (come «Rate scadute»); nel mese entra.
    const flows = scheduledMonthFlows((paymentsData ?? []).filter(r => !r.finanziamento || (r.expected_date ?? "") >= monthStart), base?.costs ?? []);
    return {
      revenueThisMonth: base?.revenueThisMonth ?? 0,
      revenuePrevMonth: base?.revenuePrevMonth ?? 0,
      marginThisMonth: base?.marginThisMonth ?? 0,
      marginPrevMonth: base?.marginPrevMonth ?? 0,
      cashFlowNet: flows.net,
      thisMonthIncome: flows.incoming,
      thisMonthOutflow: flows.outgoing,
      costsMissingVatCount: (base?.costs ?? []).filter(c => c.vat_rate == null).length,
      collectedUndatedCount: collectionsQuery.data?.undated ?? 0,
      priorReceivables: flows.priorReceivables,
      priorPayables: flows.priorPayables,
      collectedThisMonth: collectionsQuery.data?.amount ?? null,
      collectedInPeriod: base?.collectedInPeriod ?? 0,
      collectedPrevPeriod: base?.collectedPrevPeriod ?? 0,
      pendingRevenue: (paymentsData ?? []).reduce((sum, row) => sum + Math.max(0, safeNumber(row.amount)), 0),
      supplierDebt: base?.supplierDebt ?? 0,
    };
  }, [rawFinanceData, paymentsData, collectionsQuery.data, monthStart]);

  // Company targets/thresholds
  const { data: companyTargets, error: targetsError } = useQuery({
    queryKey: queryKeys.cruscotto.targets(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("monthly_revenue_target, monthly_orders_target, alert_late_orders_threshold, alert_open_tickets_threshold, alert_margin_min_pct, alert_runway_days_warning")
        .eq("id", companyId!)
        .single();
      if (error) throw error;
      return data as CompanyTargets;
    },
    enabled: !!companyId,
    staleTime: 300_000,
  });

  // Weekly agenda — fires immediately, NO dependency on paymentsData
  const { data: rawWeeklyData, isLoading: weeklyLoading, error: weeklyError } = useQuery({
    queryKey: [...queryKeys.cruscotto.weekly(companyId), "gross-costs-v2"],
    queryFn: async () => {
      const archivedIds = await loadArchivedOrderIds(companyId!);
      const now = new Date();
      const todayStr = format(now, "yyyy-MM-dd");
      // «7 giorni» con oggi compreso: oggi + 6 (con +7 erano otto)
      const weekEnd = addDays(now, 6);
      const weekEndStr = format(weekEnd, "yyyy-MM-dd");

      const [costsRes, appointmentsRes] = await Promise.all([
        supabase.from("company_costs").select("amount, due_date, vat_rate")
          .eq("company_id", companyId!).eq("is_paid", false)
          .gte("due_date", todayStr).lte("due_date", weekEndStr),
        excludeArchivedOrders(supabase.from("appointments").select("id", { count: "exact", head: true })
          .eq("company_id", companyId!)
          .eq("is_blocked_slot", false)
          // annullati e riprogrammati non sono in agenda (come nella Dashboard marketing)
          .not("status", "in", "(annullato,riprogrammato)")
          .gte("appointment_date", todayStr).lte("appointment_date", weekEndStr), archivedIds, "order_id"),
      ]);
      throwIfSupabaseError(costsRes.error, appointmentsRes.error);

      let dueCosts = 0;
      costsRes.data?.forEach(c => { dueCosts += registeredCostAmount(c); });

      return {
        dueCosts,
        dueCostsCount: costsRes.data?.length || 0,
        deliveries: 0,
        appointments: appointmentsRes.count || 0,
      };
    },
    enabled: !!companyId,
    staleTime: 120_000,
  });

  // Merge weekly + payments via useMemo
  const weeklyAgenda = useMemo<WeeklyAgendaData>(() => {
    const base = rawWeeklyData || { dueCosts: 0, dueCostsCount: 0, deliveries: 0, appointments: 0 };
    const now = new Date();
    const todayStr = format(now, "yyyy-MM-dd");
    const weekEndStr = format(addDays(now, 7), "yyyy-MM-dd");

    let incomingPayments = 0;
    let incomingPaymentsCount = 0;
    paymentsData?.forEach((inst) => {
      const amount = safeNumber(inst.amount);
      if (amount > 0 && inst.expected_date && inst.expected_date >= todayStr && inst.expected_date <= weekEndStr) {
        incomingPayments += amount;
        incomingPaymentsCount++;
      }
    });

    return { ...base, deliveries: upcomingWorkDeliveries(workQuery.data ?? [], todayStr, weekEndStr), incomingPayments, incomingPaymentsCount };
  }, [rawWeeklyData, paymentsData, workQuery.data]);

  // Focus del periodo: lead, appuntamenti e costi pagati nel periodo del filtro in alto;
  // venduto e incassato sono quelli del riquadro «Numeri del periodo» (una regola sola).
  const { data: rawTodayData, isLoading: todayLoading, error: todayError } = useQuery({
    queryKey: [...queryKeys.cruscotto.today(companyId, periodoGiorni.da, periodoGiorni.a), "periodo-del-filtro-v3"],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      const archivedIds = await loadArchivedOrderIds(companyId!);
      const nowStr = format(new Date(), "yyyy-MM-dd");
      const in7Days = format(addDays(new Date(), 6), "yyyy-MM-dd"); // oggi compreso: 7 giorni

      const [leadsRes, appointmentsRes, overdueRes, suppliersRes, costsPaidRes] = await Promise.all([
        // i limiti del periodo come istanti (ora italiana): «${giorno}T00:00:00» senza fuso era UTC
        supabase.from("marketing_contacts").select("id", { count: "exact", head: true })
          .eq("company_id", companyId!)
          .is("deleted_at", null)
          .gte("created_at", dateRange.from.toISOString())
          .lte("created_at", dateRange.to.toISOString()),
        excludeArchivedOrders(supabase.from("appointments").select("id", { count: "exact", head: true })
          .eq("company_id", companyId!)
          .gte("appointment_date", periodoGiorni.da)
          .lte("appointment_date", periodoGiorni.a)
          .eq("is_blocked_slot", false)
          .not("status", "in", "(annullato,riprogrammato)"), archivedIds, "order_id"),
        leggiRate(),
        supabase.from("company_costs")
          .select("id, name, amount, due_date, category, vat_rate")
          .eq("company_id", companyId!)
          .eq("is_paid", false)
          .gte("due_date", nowStr)
          .lte("due_date", in7Days)
          .order("due_date", { ascending: true }),
        // Costs paid in range
        supabase.from("company_costs")
          .select("amount, vat_rate")
          .eq("company_id", companyId!)
          .eq("is_paid", true)
          .gte("paid_date", periodoGiorni.da)
          .lte("paid_date", periodoGiorni.a),
      ]);
      throwIfSupabaseError(
        leadsRes.error,
        appointmentsRes.error,
        suppliersRes.error,
        costsPaidRes.error,
      );

      // Crediti scaduti verso il cliente: la rata della finanziaria non è un credito scaduto.
      const scadute = overdueRes.filter(r => r.amount > 0 && !r.finanziamento && !!r.expected_date && r.expected_date < nowStr);
      const overdueCount = scadute.length;
      const overdueAmount = scadute.reduce((s, r) => s + r.amount, 0);
      const suppliersDue = (suppliersRes.data ?? []).map(row => ({ ...row, amount: registeredCostAmount(row) }));
      const suppliersDueAmount = suppliersDue.reduce((s, c) => s + safeNumber(c.amount), 0);

      const costsPaidInRange = (costsPaidRes.data ?? []).reduce((s, r) => s + registeredCostAmount(r), 0);

      return {
        leadsToday: leadsRes.count ?? 0,
        appointmentsToday: appointmentsRes.count ?? 0,
        overdueAmount,
        overdueCount,
        suppliersDueAmount,
        suppliersDue,
        costsPaidInRange,
      };
    },
  });
  const todayData = useMemo<TodayData | null>(() => rawTodayData ? {
    ...rawTodayData,
    revenueInRange: financeData.revenueThisMonth,
    collectedInRange: financeData.collectedInPeriod ?? 0,
  } : null, [rawTodayData, financeData.revenueThisMonth, financeData.collectedInPeriod]);

  // Cash flow forecast + revenue by period
  const { data: cashFlowForecast, isLoading: forecastLoading, error: forecastError } = useQuery<CashFlowForecastData>({
    queryKey: queryKeys.cruscotto.cashFlowForecast(companyId),
    enabled: !!companyId,
    staleTime: 300_000,
    queryFn: async () => {
      const now = new Date();
      const todayStr = format(now, "yyyy-MM-dd");
      const in30 = format(addDays(now, 30), "yyyy-MM-dd");
      const in60 = format(addDays(now, 60), "yyyy-MM-dd");
      const in90 = format(addDays(now, 90), "yyyy-MM-dd");

      const all = (await leggiRate()).filter((i): i is InstallmentRow & { expected_date: string } =>
        !!i.expected_date && i.expected_date >= todayStr && i.expected_date <= in90);
      const incoming30 = all.filter(i => i.expected_date <= in30).reduce((s, i) => s + i.amount, 0);
      const incoming60 = all.filter(i => i.expected_date <= in60).reduce((s, i) => s + i.amount, 0);
      const incoming90 = all.reduce((s, i) => s + i.amount, 0);

      // istanti in ora italiana: «…-01-01T00:00:00» senza fuso il database lo leggeva in UTC
      const yearStart = new Date(now.getFullYear(), 0, 1).toISOString();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1).toISOString();

      // Venduto dell'anno, del trimestre e del mese: contratto più varianti approvate,
      // come il riquadro «Venduto» (una lettura sola, a pagine).
      const [ordiniAnno, variantiAnno] = await Promise.all([
        readAllOrderRows<{ id: string; total_amount: number | null; created_at: string }>((from, to) => supabase
          .from("orders").select("id, total_amount, created_at").eq("company_id", companyId!).is("deleted_at", null)
          .gte("created_at", yearStart).order("id").range(from, to)),
        readAllOrderRows<{ order_id: string; impatto_economico: number | null }>((from, to) => supabase
          .from("ordini_variazione").select("id, order_id, impatto_economico, order:orders!inner(created_at, deleted_at)")
          .eq("company_id", companyId!).eq("status", "approvato")
          .gte("order.created_at", yearStart).is("order.deleted_at", null)
          .order("id").range(from, to) as unknown as PromiseLike<{ data: { order_id: string; impatto_economico: number | null }[] | null; error: unknown }>),
      ]);
      const variantiPerCommessa = new Map<string, number>();
      for (const v of variantiAnno) variantiPerCommessa.set(v.order_id, (variantiPerCommessa.get(v.order_id) ?? 0) + safeNumber(v.impatto_economico));
      const venduto = (dal: string) => ordiniAnno
        .filter(o => o.created_at >= dal)
        .reduce((s, o) => s + safeNumber(o.total_amount) + (variantiPerCommessa.get(o.id) ?? 0), 0);

      return {
        incoming30,
        incoming60,
        incoming90,
        ytdRevenue: venduto(yearStart),
        monthRevenue: venduto(monthStart),
        quarterRevenue: venduto(quarterStart),
      };
    },
  });

  const updateFilters = useCallback((partial: Partial<CruscottoFiltersState>) => {
    setFilters((prev: CruscottoFiltersState) => {
      const next = { ...prev, ...partial };
      if (partial.datePreset && partial.datePreset !== "custom") {
        const range = getDateRange(partial.datePreset);
        next.dateFrom = range.from;
        next.dateTo = range.to;
      }
      return next;
    });
  }, []);

  const firstError =
    workQuery.error ||
    collectionsQuery.error ||
    marketingError ||
    paymentsError ||
    opsError ||
    financeError ||
    targetsError ||
    weeklyError ||
    todayError ||
    forecastError ||
    null;

  return {
    marketing: marketingData || null,
    operations: opsData,
    scaduto,
    workOrders: workQuery.data ?? [],
    finance: financeData,
    financeError: financeError || paymentsError || collectionsQuery.error,
    operationsError: workQuery.error || opsError || paymentsError,
    todayError,
    weeklyAgenda,
    companyTargets: companyTargets || null,
    todayData,
    cashFlowForecast: cashFlowForecast ?? null,
    isLoading: paymentsLoading || collectionsQuery.isLoading || workQuery.isLoading || marketingLoading || opsLoading || financeLoading || weeklyLoading || todayLoading || forecastLoading,
    error: firstError as Error | null,
    filters,
    updateFilters,
  };
}
