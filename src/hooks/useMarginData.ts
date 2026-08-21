// ============================================================================
// useMarginData — analisi margini commesse (MarginTab, PuntoDiPareggio)
// ============================================================================
// FONTE UNICA: v_ordine_marginalita — la stessa vista di scheda commessa e
// Controllo di Gestione. Prima questo hook rifaceva i conti per conto suo
// scorporando l'IVA da purchase_price/total_cost (che per convenzione sono
// GIÀ imponibili in tutta l'app): terzo margine diverso sulle stesse commesse.
// Ora un margine solo, ovunque.
// ============================================================================
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { recurrenceMultiplier } from "@/lib/forecastTypes";
import { queryKeys } from "@/lib/queryKeys";

export interface OrderMargin {
  orderId: string;
  orderCode: string | null;
  customerName: string;
  description: string;
  totalAmount: number; // imponibile (preventivo + variazioni approvate)
  vatRate: number;
  grossRevenue: number; // lordo con IVA (indicativo)
  itemsCostNet: number; // acquisti ODA + errori + costi diretti di commessa
  teamsCostNet: number; // manodopera interna + squadre esterne
  commissions: number;
  totalVariableCosts: number; // = consuntivo della vista
  grossMargin: number;
  marginPercent: number;
}

export interface FixedCostBreakdown {
  category: string;
  amount: number;
}

export interface MarginData {
  isLoading: boolean;
  orders: OrderMargin[];
  // KPIs
  avgMarginEur: number;
  avgMarginPercent: number;
  minMarginOrder: OrderMargin | null;
  maxMarginOrder: OrderMargin | null;
  stdDeviation: number;
  // Fixed costs
  fixedCosts: FixedCostBreakdown[];
  totalFixedCostsMonthly: number;
  salariesMonthly: number;
  // Break even
  breakEvenRevenue: number;
  breakEvenAnnual: number;
  breakEvenMonthOfYear: number; // 1-12 = mese da cui guadagni per te; >12 = non raggiunto
  currentMonthlyRevenue: number;
  breakEvenDelta: number;
  // Company context
  companyId: string | null;
}

interface MarginViewRow {
  id: string;
  order_code: string | null;
  description: string | null;
  cliente_nome: string | null;
  created_at: string | null;
  preventivo_totale: number | null;
  consuntivo: number | null;
  costo_acquisti: number | null;
  costo_errori: number | null;
  costo_manodopera: number | null;
  costo_provvigioni: number | null;
  costo_diretto: number | null;
  margine: number | null;
  margine_perc: number | null;
}

export function useMarginData(): MarginData {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id || null;

  // 1. Marginalità per commessa dalla vista condivisa (ultimi 24 mesi)
  const { data: ordersRaw, isLoading: loadingOrders } = useQuery({
    queryKey: queryKeys.margin.orders(companyId),
    queryFn: async (): Promise<MarginViewRow[]> => {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - 24);
      const { data, error } = await (supabase as any)
        .from("v_ordine_marginalita")
        .select("id, order_code, description, cliente_nome, created_at, preventivo_totale, consuntivo, costo_acquisti, costo_errori, costo_manodopera, costo_provvigioni, costo_diretto, margine, margine_perc")
        .eq("company_id", companyId!)
        .gte("created_at", cutoff.toISOString())
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as MarginViewRow[];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  // 2. Fixed company costs (amount è GIÀ imponibile: niente scorporo)
  const { data: fixedCostsRaw, isLoading: loadingFixedCosts } = useQuery({
    queryKey: queryKeys.margin.fixedCosts(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_costs")
        .select("amount, category, recurrence")
        .eq("company_id", companyId!)
        .eq("cost_type", "fixed");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  // 3. Active employees (salaries + oneri, come nel resto dell'app)
  const { data: employees, isLoading: loadingEmployees } = useQuery({
    queryKey: queryKeys.margin.employees(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("gross_salary, inps_rate")
        .eq("company_id", companyId!)
        .eq("is_active", true);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = loadingOrders || loadingFixedCosts || loadingEmployees;

  // --- Calculations ---

  // Per-order margin: numeri PRESI dalla vista, non ricalcolati.
  const orders: OrderMargin[] = (ordersRaw || []).map((v) => {
    const totalAmount = Number(v.preventivo_totale) || 0;
    const itemsCostNet =
      (Number(v.costo_acquisti) || 0) + (Number(v.costo_errori) || 0) + (Number(v.costo_diretto) || 0);
    const teamsCostNet = Number(v.costo_manodopera) || 0;
    const commissions = Number(v.costo_provvigioni) || 0;
    const totalVariableCosts = Number(v.consuntivo) || 0;
    const grossMargin = Number(v.margine) || 0;
    const marginPercent = Number(v.margine_perc) || 0;

    return {
      orderId: v.id,
      orderCode: v.order_code,
      customerName: v.cliente_nome?.trim() || "N/D",
      description: v.description || "",
      totalAmount,
      vatRate: 22,
      grossRevenue: totalAmount * 1.22,
      itemsCostNet,
      teamsCostNet,
      commissions,
      totalVariableCosts,
      grossMargin,
      marginPercent,
    };
  });

  // Sort by margin % ascending (worst first)
  orders.sort((a, b) => a.marginPercent - b.marginPercent);

  // KPIs
  const ordersWithRevenue = orders.filter(o => o.totalAmount > 0);
  const totalRevenueAll = ordersWithRevenue.reduce((s, o) => s + o.totalAmount, 0);
  const totalMarginAll = ordersWithRevenue.reduce((s, o) => s + o.grossMargin, 0);
  const avgMarginPercent = totalRevenueAll > 0
    ? (totalMarginAll / totalRevenueAll) * 100
    : 0;
  const avgMarginEur = ordersWithRevenue.length > 0
    ? ordersWithRevenue.reduce((s, o) => s + o.grossMargin, 0) / ordersWithRevenue.length
    : 0;

  const minMarginOrder = ordersWithRevenue.length > 0 ? ordersWithRevenue[0] : null;
  const maxMarginOrder = ordersWithRevenue.length > 0 ? ordersWithRevenue[ordersWithRevenue.length - 1] : null;

  // Standard deviation
  const stdDeviation = ordersWithRevenue.length > 1
    ? Math.sqrt(
        ordersWithRevenue.reduce((s, o) => s + Math.pow(o.marginPercent - avgMarginPercent, 2), 0) /
          ordersWithRevenue.length
      )
    : 0;

  // Fixed costs aggregation (normalize to monthly using shared utility).
  // company_costs.amount è imponibile per convenzione: usarlo così com'è —
  // lo scorporo IVA di prima SOTTOSTIMAVA i costi fissi del break-even.
  const fixedCostsByCategory = new Map<string, number>();
  (fixedCostsRaw || []).forEach(cost => {
    const monthly = (Number(cost.amount) || 0) * recurrenceMultiplier(cost.recurrence);
    const cat = cost.category || "Altro";
    fixedCostsByCategory.set(cat, (fixedCostsByCategory.get(cat) || 0) + monthly);
  });

  const fixedCosts: FixedCostBreakdown[] = Array.from(fixedCostsByCategory.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  const totalFixedCostsFromCosts = fixedCosts.reduce((s, c) => s + c.amount, 0);
  // Lordo + oneri contributivi (stessa formula della pagina Costi): il solo
  // lordo nascondeva ~28% del costo del personale al punto di pareggio.
  const salariesMonthly = (employees || []).reduce((s, e: any) => {
    const salary = Number(e.gross_salary) || 0;
    const inpsRate = Number(e.inps_rate) || 28;
    return s + salary * (1 + inpsRate / 100);
  }, 0);
  const totalFixedCostsMonthly = totalFixedCostsFromCosts + salariesMonthly;

  // Break even
  const breakEvenRevenue = avgMarginPercent > 0
    ? totalFixedCostsMonthly / (avgMarginPercent / 100)
    : 0;

  // Current monthly revenue (rolling 12-month window for accuracy)
  const now = new Date();
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const recentRows = (ordersRaw || []).filter(r => r.created_at && new Date(r.created_at) >= twelveMonthsAgo);

  let currentMonthlyRevenue: number;
  if (recentRows.length > 0) {
    const recentRevenue = recentRows.reduce((s, r) => s + (Number(r.preventivo_totale) || 0), 0);
    const oldestRecentTs = Math.min(...recentRows.map(r => new Date(r.created_at!).getTime()));
    const monthsInWindow = Math.max(1, (now.getTime() - oldestRecentTs) / (1000 * 60 * 60 * 24 * 30));
    currentMonthlyRevenue = recentRevenue / monthsInWindow;
  } else {
    // Fallback: storico completo
    const totalRevenue = orders.reduce((s, o) => s + o.totalAmount, 0);
    const oldestOrderDate = ordersRaw && ordersRaw.length > 0
      ? new Date(Math.min(...ordersRaw.map(o => new Date(o.created_at ?? now).getTime())))
      : now;
    const monthsActive = Math.max(1, (now.getTime() - oldestOrderDate.getTime()) / (1000 * 60 * 60 * 24 * 30));
    currentMonthlyRevenue = totalRevenue / monthsActive;
  }

  const breakEvenDelta = currentMonthlyRevenue - breakEvenRevenue;

  // Annual break-even & break-even month of year (based on ACTUAL revenue pace)
  const breakEvenAnnual = breakEvenRevenue * 12;
  const monthlyContribution = currentMonthlyRevenue * (avgMarginPercent / 100);
  const breakEvenMonthOfYear = monthlyContribution > 0
    ? Math.min(13, Math.ceil((totalFixedCostsMonthly * 12) / monthlyContribution))
    : 13; // 13 = non raggiunto nell'anno

  return {
    isLoading,
    orders,
    avgMarginEur,
    avgMarginPercent,
    minMarginOrder,
    maxMarginOrder,
    stdDeviation,
    fixedCosts,
    totalFixedCostsMonthly,
    salariesMonthly,
    breakEvenRevenue,
    breakEvenAnnual,
    breakEvenMonthOfYear,
    currentMonthlyRevenue,
    breakEvenDelta,
    companyId,
  };
}
