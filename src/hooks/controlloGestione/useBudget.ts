/**
 * Hook React Query — Budget vs Consuntivo + Forecast.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Semaforo } from "./useMarginalitaCommesse";
import { cgRpc } from "@/hooks/controlloGestione/cgRpc";

export interface VoceBudget {
  codice: string;
  label: string;
  tipo: "voce" | "subtot" | "subtot_grasso";
  budget: number;
  consuntivo_ytd: number;
  forecast_anno: number;
  variance_eur: number;
  variance_pct: number | null;
  semaforo: Semaforo;
}

export interface BudgetResult {
  meta: {
    company_id: string;
    anno: number;
    mese_corrente: number;
    is_anno_corrente: boolean;
    generato_il: string;
  };
  voci: VoceBudget[];
}

export function useBudgetForecast(anno: number) {
  return useQuery({
    queryKey: ["cg", "budget-forecast", anno] as const,
    queryFn: async (): Promise<BudgetResult> => {
            const { data, error } = await cgRpc("cg_get_budget_consuntivo_forecast_safe", { p_anno: anno });
      if (error) throw error;
      return data as unknown as BudgetResult;
    },
    staleTime: 60_000,
  });
}

// CRUD budget
export interface BudgetRow {
  id: string;
  company_id: string;
  anno: number;
  codice: string;
  importo: number;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export function useBudgetRows(anno: number) {
  return useQuery({
    queryKey: ["cg", "budget-rows", anno] as const,
    queryFn: async (): Promise<BudgetRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("cg_budget")
        .select("*")
        .eq("anno", anno)
        .order("codice");
      if (error) throw error;
      return (data ?? []) as BudgetRow[];
    },
    staleTime: 60_000,
  });
}

export function useUpsertBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      anno: number;
      codice: string;
      importo: number;
      note?: string | null;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("cg_budget")
        .upsert(input, { onConflict: "company_id,anno,codice" })
        .select()
        .single();
      if (error) throw error;
      return data as BudgetRow;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["cg", "budget-rows", vars.anno] });
      qc.invalidateQueries({ queryKey: ["cg", "budget-forecast", vars.anno] });
    },
  });
}
