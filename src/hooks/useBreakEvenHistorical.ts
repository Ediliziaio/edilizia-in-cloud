import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { calculateNetFromGross } from "@/lib/vatUtils";
import { recurrenceMultiplier } from "@/lib/forecastTypes";
import { queryKeys } from "@/lib/queryKeys";

export interface BreakEvenYear {
  year: number;
  totalRevenue: number;
  avgMarginPercent: number;
  fixedCostsAnnual: number;
  breakEvenAnnual: number;
  breakEvenMonthOfYear: number;
  reachedBreakEven: boolean;
}

export function useBreakEvenHistorical() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id || null;

  const { data: ordersRaw, isLoading: loadingOrders } = useQuery({
    queryKey: queryKeys.breakEven.orders(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, total_amount, vat_rate, created_at")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  const orderIds = (ordersRaw || []).map(o => o.id);

  const { data: orderItems, isLoading: loadingItems } = useQuery({
    queryKey: ["be-hist-items", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("order_id, purchase_price, quantity, vat_rate")
        .in("order_id", orderIds);
      if (error) throw error;
      return data;
    },
    enabled: orderIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const { data: externalTeams, isLoading: loadingTeams } = useQuery({
    queryKey: ["be-hist-teams", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_external_teams")
        .select("order_id, total_cost, vat_rate")
        .in("order_id", orderIds);
      if (error) throw error;
      return data;
    },
    enabled: orderIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const { data: fixedCostsRaw, isLoading: loadingFC } = useQuery({
    queryKey: ["be-hist-fixed-costs", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_costs")
        .select("amount, category, recurrence, vat_rate")
        .eq("company_id", companyId!)
        .eq("cost_type", "fixed");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: employees, isLoading: loadingEmp } = useQuery({
    queryKey: ["be-hist-employees", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("gross_salary")
        .eq("company_id", companyId!)
        .eq("is_active", true);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = loadingOrders || loadingItems || loadingTeams || loadingFC || loadingEmp;

  // Fixed costs (current structure as proxy)
  const fixedCostsMonthlyByCat = new Map<string, number>();
  (fixedCostsRaw || []).forEach(cost => {
    const vat = cost.vat_rate ?? 22;
    const { netAmount } = calculateNetFromGross(cost.amount, vat);
    const monthly = netAmount * recurrenceMultiplier(cost.recurrence);
    const cat = cost.category || "Altro";
    fixedCostsMonthlyByCat.set(cat, (fixedCostsMonthlyByCat.get(cat) || 0) + monthly);
  });
  const totalFixedCostsMonthly =
    Array.from(fixedCostsMonthlyByCat.values()).reduce((s, v) => s + v, 0) +
    (employees || []).reduce((s, e) => s + (e.gross_salary || 0), 0);
  const fixedCostsAnnual = totalFixedCostsMonthly * 12;

  // Group orders by year
  const yearMap = new Map<number, { revenue: number; totalVariableCosts: number; orderCount: number }>();

  (ordersRaw || []).forEach(order => {
    const year = new Date(order.created_at ?? new Date()).getFullYear();
    const totalAmount = order.total_amount || 0;

    const items = (orderItems || []).filter(i => i.order_id === order.id);
    const itemsCostNet = items.reduce((sum, item) => {
      const gross = (item.purchase_price || 0) * (item.quantity || 1);
      const { netAmount } = calculateNetFromGross(gross, item.vat_rate ?? 22);
      return sum + netAmount;
    }, 0);

    const teams = (externalTeams || []).filter(t => t.order_id === order.id);
    const teamsCostNet = teams.reduce((sum, team) => {
      const { netAmount } = calculateNetFromGross(team.total_cost || 0, team.vat_rate ?? 22);
      return sum + netAmount;
    }, 0);

    const totalVariableCosts = itemsCostNet + teamsCostNet;

    if (!yearMap.has(year)) {
      yearMap.set(year, { revenue: 0, totalVariableCosts: 0, orderCount: 0 });
    }
    const entry = yearMap.get(year)!;
    entry.revenue += totalAmount;
    entry.totalVariableCosts += totalVariableCosts;
    entry.orderCount++;
  });

  // Build historical array
  const historicalData: BreakEvenYear[] = Array.from(yearMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, { revenue, totalVariableCosts }]) => {
      const grossMargin = revenue - totalVariableCosts;
      const avgMarginPercent = revenue > 0 ? (grossMargin / revenue) * 100 : 0;
      const breakEvenAnnual = avgMarginPercent > 0 ? fixedCostsAnnual / (avgMarginPercent / 100) : 0;

      const monthlyRevenue = revenue / 12;
      const monthlyContrib = monthlyRevenue * (avgMarginPercent / 100);
      const breakEvenMonthOfYear = monthlyContrib > 0
        ? Math.min(13, Math.ceil(fixedCostsAnnual / monthlyContrib))
        : 13;

      return {
        year,
        totalRevenue: revenue,
        avgMarginPercent,
        fixedCostsAnnual,
        breakEvenAnnual,
        breakEvenMonthOfYear,
        reachedBreakEven: revenue >= breakEvenAnnual && breakEvenAnnual > 0,
      };
    });

  return { historicalData, isLoading, fixedCostsAnnual };
}
