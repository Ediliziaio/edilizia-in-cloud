import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CashFlowProjectionDay {
  date: string;
  inflows: number;
  outflows: number;
  balance: number;
}

export interface CashFlowRealData {
  currentBalance: number;
  pendingIncome30: number;
  pendingExpenses30: number;
  pendingIncome90: number;
  pendingExpenses90: number;
  projection: CashFlowProjectionDay[];
  hasBanking: boolean;
}

export function useCashFlowRealData(companyId: string | null | undefined) {
  return useQuery({
    queryKey: ["cashflow-real", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<CashFlowRealData> => {
      const in90 = new Date();
      in90.setDate(in90.getDate() + 90);
      const in90Str = in90.toISOString().split("T")[0];

      const [accountsRes, receivablesRes, payablesRes] = await Promise.all([
        // 1. Saldo attuale banking
        supabase
          .from("bank_accounts")
          .select("current_balance")
          .eq("company_id", companyId!)
          .eq("is_active", true),

        // 2. Fatture emesse non pagate con scadenza entro 90gg
        supabase
          .from("invoices")
          .select("total, paid_amount, due_date")
          .eq("company_id", companyId!)
          .not("status", "in", '("paid","cancelled","draft")')
          .not("due_date", "is", null)
          .lte("due_date", in90Str),

        // 3. Ordini di acquisto aperti con consegna entro 90gg
        supabase
          .from("purchase_orders")
          .select("total, expected_delivery_date")
          .eq("company_id", companyId!)
          .in("status", ["inviato", "confermato", "parziale"])
          .not("expected_delivery_date", "is", null)
          .lte("expected_delivery_date", in90Str),
      ]);

      const accounts = accountsRes.data || [];
      const receivables = receivablesRes.data || [];
      const payables = payablesRes.data || [];

      const currentBalance = accounts.reduce((s, a) => s + (a.current_balance || 0), 0);
      const hasBanking = accounts.length > 0;

      const today = new Date();
      const todayStr = today.toISOString().split("T")[0];

      // Build 90-day projection
      let running = currentBalance;
      const projection: CashFlowProjectionDay[] = Array.from({ length: 90 }, (_, i) => {
        const d = new Date(today);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split("T")[0];

        const inflows = receivables
          .filter((r) => r.due_date === dateStr)
          .reduce((s, r) => s + Math.max(0, (r.total || 0) - (r.paid_amount || 0)), 0);

        const outflows = payables
          .filter((p) => p.expected_delivery_date === dateStr)
          .reduce((s, p) => s + (p.total || 0), 0);

        running += inflows - outflows;

        return { date: dateStr, inflows, outflows, balance: running };
      });

      // 30-day summary
      const in30Str = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30)
        .toISOString().split("T")[0];

      const pendingIncome30 = receivables
        .filter((r) => r.due_date && r.due_date >= todayStr && r.due_date <= in30Str)
        .reduce((s, r) => s + Math.max(0, (r.total || 0) - (r.paid_amount || 0)), 0);

      const pendingExpenses30 = payables
        .filter((p) => p.expected_delivery_date && p.expected_delivery_date >= todayStr && p.expected_delivery_date <= in30Str)
        .reduce((s, p) => s + (p.total || 0), 0);

      const pendingIncome90 = receivables
        .reduce((s, r) => s + Math.max(0, (r.total || 0) - (r.paid_amount || 0)), 0);

      const pendingExpenses90 = payables
        .reduce((s, p) => s + (p.total || 0), 0);

      return {
        currentBalance,
        pendingIncome30,
        pendingExpenses30,
        pendingIncome90,
        pendingExpenses90,
        projection,
        hasBanking,
      };
    },
  });
}
