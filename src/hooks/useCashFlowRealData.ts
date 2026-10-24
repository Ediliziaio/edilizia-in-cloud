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
      // Date LOCALI (en-CA = YYYY-MM-DD nel fuso locale). Con toISOString() la
      // proiezione confrontava per uguaglianza esatta stringhe UTC contro
      // due_date date-only: a cavallo di mezzanotte/ora legale allocava
      // entrate/uscite nel giorno sbagliato.
      const localYmd = (d: Date) => d.toLocaleDateString("en-CA");
      const in90 = new Date();
      in90.setDate(in90.getDate() + 90);
      const in90Str = localYmd(in90);

      const [accountsRes, receivablesRes, noteRes, payablesRes] = await Promise.all([
        // 1. Saldo attuale banking
        supabase
          .from("bank_accounts")
          .select("current_balance")
          .eq("company_id", companyId!)
          .eq("is_active", true),

        // 2. Fatture emesse non pagate con scadenza entro 90gg
        supabase
          .from("invoices")
          .select("id, total, paid_amount, due_date")
          .eq("company_id", companyId!)
          .not("status", "in", '("paid","cancelled","draft","credited")')
          .not("due_date", "is", null)
          .lte("due_date", in90Str),

        // 2b. Note di credito collegate: riducono il dovuto della fattura.
        supabase
          .from("invoices")
          .select("credited_invoice_id, total")
          .eq("company_id", companyId!)
          .eq("document_type", "credit_note")
          .not("credited_invoice_id", "is", null)
          .is("deleted_at", null)
          .neq("status", "cancelled"),

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
      // Dovuto al netto delle note di credito parziali collegate.
      const ncByInvoice = new Map<string, number>();
      for (const nc of (noteRes.data || []) as { credited_invoice_id: string | null; total: number | null }[])
        if (nc.credited_invoice_id)
          ncByInvoice.set(nc.credited_invoice_id, (ncByInvoice.get(nc.credited_invoice_id) ?? 0) + (nc.total || 0));
      const receivables = ((receivablesRes.data || []) as { id: string; total: number | null; paid_amount: number | null; due_date: string | null }[])
        .map((r) => ({ ...r, residuo: Math.max(0, (r.total || 0) - (r.paid_amount || 0) - (ncByInvoice.get(r.id) ?? 0)) }));
      const payables = payablesRes.data || [];

      const currentBalance = accounts.reduce((s, a) => s + (a.current_balance || 0), 0);
      const hasBanking = accounts.length > 0;

      const today = new Date();
      const todayStr = localYmd(today);

      // Build 90-day projection
      let running = currentBalance;
      const projection: CashFlowProjectionDay[] = Array.from({ length: 90 }, (_, i) => {
        const d = new Date(today);
        d.setDate(d.getDate() + i);
        const dateStr = localYmd(d);

        const inflows = receivables
          .filter((r) => r.due_date === dateStr)
          .reduce((s, r) => s + r.residuo, 0);

        const outflows = payables
          .filter((p) => p.expected_delivery_date === dateStr)
          .reduce((s, p) => s + (p.total || 0), 0);

        running += inflows - outflows;

        return { date: dateStr, inflows, outflows, balance: running };
      });

      // 30-day summary
      const in30Str = localYmd(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30));

      const pendingIncome30 = receivables
        .filter((r) => r.due_date && r.due_date >= todayStr && r.due_date <= in30Str)
        .reduce((s, r) => s + r.residuo, 0);

      const pendingExpenses30 = payables
        .filter((p) => p.expected_delivery_date && p.expected_delivery_date >= todayStr && p.expected_delivery_date <= in30Str)
        .reduce((s, p) => s + (p.total || 0), 0);

      const pendingIncome90 = receivables
        .reduce((s, r) => s + r.residuo, 0);

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
