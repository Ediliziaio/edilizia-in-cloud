/**
 * Sprint C — Catalogo Esteso
 * Hook: carica statistiche di consumo AI della company per l'ultimo periodo.
 * Tabella: ai_usage_logs (admin-only via RLS).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface AiUsageStats {
  totalCallsMonth: number;
  totalCostCentsMonth: number;
  totalTokensMonth: number;
  callsByFunction: Record<string, number>;
  lastCalls: Array<{
    id: string;
    function_name: string;
    tokens_input: number;
    tokens_output: number;
    cost_cents: number;
    status: string;
    created_at: string;
  }>;
}

export function useAiUsageStats(days = 30) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  return useQuery<AiUsageStats>({
    queryKey: ["ai-usage-stats", companyId, days],
    queryFn: async () => {
      if (!companyId) {
        return {
          totalCallsMonth: 0,
          totalCostCentsMonth: 0,
          totalTokensMonth: 0,
          callsByFunction: {},
          lastCalls: [],
        };
      }
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await (supabase.from as any)("ai_usage_logs")
        .select("id, function_name, tokens_input, tokens_output, cost_cents, status, created_at")
        .eq("company_id", companyId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;

      const rows = (data ?? []) as AiUsageStats["lastCalls"];
      const callsByFunction: Record<string, number> = {};
      let totalTokens = 0;
      let totalCost = 0;
      for (const r of rows) {
        callsByFunction[r.function_name] = (callsByFunction[r.function_name] ?? 0) + 1;
        totalTokens += (r.tokens_input ?? 0) + (r.tokens_output ?? 0);
        totalCost += Number(r.cost_cents ?? 0);
      }
      return {
        totalCallsMonth: rows.length,
        totalCostCentsMonth: totalCost,
        totalTokensMonth: totalTokens,
        callsByFunction,
        lastCalls: rows.slice(0, 20),
      };
    },
    enabled: !!companyId,
    staleTime: 60 * 1000,
  });
}
