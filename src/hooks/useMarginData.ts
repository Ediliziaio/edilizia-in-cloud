import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { calculateNetFromGross } from "@/lib/vatUtils";
import { recurrenceMultiplier } from "@/lib/forecastTypes";

export interface OrderMargin {
  orderId: string;
  orderCode: string | null;
  customerName: string;
  description: string;
  totalAmount: number; // imponibile
  vatRate: number;
  grossRevenue: number; // lordo con IVA
  itemsCostNet: number;
  teamsCostNet: number;
  commissions: number;
  totalVariableCosts: number;
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

export function useMarginData(): MarginData {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id || null;

  // 1. Orders with customer name
  const { data: ordersRaw, isLoading: loadingOrders } = useQuery({
    queryKey: ["margin-orders", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_code, total_amount, vat_rate, description, created_at, customer:profiles!orders_customer_id_fkey(first_name, last_name)")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(500); // sicurezza: margini calcolati sugli ultimi 500 ordini; TODO filtro data rolling 24 mesi
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  // 2. Order items (purchase costs)
  const { data: orderItems, isLoading: loadingItems } = useQuery({
    queryKey: ["margin-order-items", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("order_id, purchase_price, quantity, vat_rate")
        .in("order_id", (ordersRaw || []).map(o => o.id));
      if (error) throw error;
      return data;
    },
    enabled: !!ordersRaw && ordersRaw.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // 3. External teams
  const { data: externalTeams, isLoading: loadingTeams } = useQuery({
    queryKey: ["margin-external-teams", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_external_teams")
        .select("order_id, total_cost, vat_rate")
        .in("order_id", (ordersRaw || []).map(o => o.id));
      if (error) throw error;
      return data;
    },
    enabled: !!ordersRaw && ordersRaw.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // 4. Salespeople commissions
  const { data: salespeople, isLoading: loadingSales } = useQuery({
    queryKey: ["margin-salespeople", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_salespeople")
        .select("order_id, commission_type, commission_value, deduction_amount")
        .in("order_id", (ordersRaw || []).map(o => o.id));
      if (error) throw error;
      return data;
    },
    enabled: !!ordersRaw && ordersRaw.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // 5. Fixed company costs
  const { data: fixedCostsRaw, isLoading: loadingFixedCosts } = useQuery({
    queryKey: ["margin-fixed-costs", companyId],
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

  // 6. Active employees (salaries)
  const { data: employees, isLoading: loadingEmployees } = useQuery({
    queryKey: ["margin-employees", companyId],
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

  const isLoading = loadingOrders || loadingItems || loadingTeams || loadingSales || loadingFixedCosts || loadingEmployees;

  // --- Calculations ---

  // Build per-order margin data
  const orders: OrderMargin[] = (ordersRaw || []).map(order => {
    const totalAmount = order.total_amount || 0;
    const vatRate = order.vat_rate ?? 22;
    const grossRevenue = totalAmount * (1 + vatRate / 100);

    // Item costs (purchase_price is gross, scorporare IVA)
    const items = (orderItems || []).filter(i => i.order_id === order.id);
    const itemsCostNet = items.reduce((sum, item) => {
      const gross = (item.purchase_price || 0) * (item.quantity || 1);
      const itemVat = item.vat_rate ?? 22;
      const { netAmount } = calculateNetFromGross(gross, itemVat);
      return sum + netAmount;
    }, 0);

    // External teams (total_cost is gross, scorporare IVA)
    const teams = (externalTeams || []).filter(t => t.order_id === order.id);
    const teamsCostNet = teams.reduce((sum, team) => {
      const teamVat = team.vat_rate ?? 22;
      const { netAmount } = calculateNetFromGross(team.total_cost, teamVat);
      return sum + netAmount;
    }, 0);

    // Commissions (calculated on imponibile, same logic as OrderEconomics)
    const spEntries = (salespeople || []).filter(s => s.order_id === order.id);
    const commissions = spEntries.reduce((sum, sp) => {
      let gross = 0;
      switch (sp.commission_type) {
        case "fixed":
          gross = sp.commission_value;
          break;
        case "percentage_sold":
        case "percentage_collected":
          gross = totalAmount * (sp.commission_value / 100);
          break;
      }
      return sum + (gross - (sp.deduction_amount || 0));
    }, 0);

    const totalVariableCosts = itemsCostNet + teamsCostNet + commissions;
    const grossMargin = totalAmount - totalVariableCosts;
    const marginPercent = totalAmount > 0 ? (grossMargin / totalAmount) * 100 : 0;

    const customer = order.customer as { first_name: string; last_name: string } | null;

    return {
      orderId: order.id,
      orderCode: order.order_code,
      customerName: customer ? `${customer.first_name} ${customer.last_name}` : "N/D",
      description: order.description,
      totalAmount,
      vatRate,
      grossRevenue,
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
  const avgMarginPercent = ordersWithRevenue.length > 0
    ? ordersWithRevenue.reduce((s, o) => s + o.marginPercent, 0) / ordersWithRevenue.length
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

  // Fixed costs aggregation (normalize to monthly using shared utility)

  const fixedCostsByCategory = new Map<string, number>();
  (fixedCostsRaw || []).forEach(cost => {
    const costVat = cost.vat_rate ?? 22;
    const { netAmount } = calculateNetFromGross(cost.amount, costVat);
    const monthly = netAmount * recurrenceMultiplier(cost.recurrence);
    const cat = cost.category || "Altro";
    fixedCostsByCategory.set(cat, (fixedCostsByCategory.get(cat) || 0) + monthly);
  });

  const fixedCosts: FixedCostBreakdown[] = Array.from(fixedCostsByCategory.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  const totalFixedCostsFromCosts = fixedCosts.reduce((s, c) => s + c.amount, 0);
  const salariesMonthly = (employees || []).reduce((s, e) => s + (e.gross_salary || 0), 0);
  const totalFixedCostsMonthly = totalFixedCostsFromCosts + salariesMonthly;

  // Break even
  const breakEvenRevenue = avgMarginPercent > 0
    ? totalFixedCostsMonthly / (avgMarginPercent / 100)
    : 0;

  // Current monthly revenue (estimate from total orders / active months)
  const totalRevenue = orders.reduce((s, o) => s + o.totalAmount, 0);
  // Estimate active months from oldest order to now
  const now = new Date();
  const oldestOrderDate = ordersRaw && ordersRaw.length > 0
    ? new Date(Math.min(...ordersRaw.map(o => new Date(o.created_at ?? now).getTime())))
    : now;
  const monthsActive = Math.max(1, (now.getTime() - oldestOrderDate.getTime()) / (1000 * 60 * 60 * 24 * 30));
  const currentMonthlyRevenue = totalRevenue / monthsActive;

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
    currentMonthlyRevenue,
    breakEvenDelta,
    breakEvenAnnual,
    yearlyRevenue,
    breakEvenMonthOfYear,
    companyId,
  };
}
