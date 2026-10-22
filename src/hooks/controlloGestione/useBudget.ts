/**
 * Hook React Query — Budget contro consuntivo e previsione di fine anno.
 *
 * Il confronto parte dallo STESSO conto economico della scheda CE
 * (cg_get_ce_safe sui mesi chiusi): prima c'era una RPC a parte
 * (cg_get_budget_consuntivo_forecast_safe) che per la stessa voce dava numeri
 * diversi dal CE e non calcolava il budget dei totali (EBITDA, utile).
 */

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useCEriclassificato } from "@/hooks/controlloGestione/useCEriclassificato";
import { costruisciBudget, mesiChiusi, type RiepilogoBudget } from "@/lib/controlloGestione/budgetCE";

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
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["cg", "budget-rows", anno, companyId] as const,
    enabled: !!companyId,
    queryFn: async (): Promise<BudgetRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("cg_budget")
        .select("*")
      // Solo QUESTA azienda: la sicurezza del database fa vedere al super admin
      // (e a chi ha più aziende) le righe di tutte, e il Controllo di Gestione
      // le sommava.
        .eq("company_id", companyId)
        .eq("anno", anno)
        .order("codice");
      if (error) throw error;
      return (data ?? []) as BudgetRow[];
    },
    staleTime: 60_000,
  });
}

/**
 * Budget contro consuntivo sullo stesso CE della scheda CE riclassificato:
 * consuntivo dei mesi chiusi, previsione lineare a 12 mesi, totali A…L anche
 * per il budget.
 */
export function useBudgetConfronto(anno: number): {
  data: RiepilogoBudget | undefined;
  note: Record<string, string | null>;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
} {
  const n = mesiChiusi(anno);
  const righe = useBudgetRows(anno);
  // Con zero mesi chiusi (gennaio, o anno futuro) il CE non serve: lo si chiede
  // comunque su gennaio (gli hook non possono essere condizionali) e lo si ignora.
  const ce = useCEriclassificato(anno, 1, Math.max(n, 1));
  const righeData = righe.data;
  const ceData = ce.data;
  const data = useMemo(() => {
    if (!righeData || (n > 0 && !ceData)) return undefined;
    const budget: Record<string, number> = {};
    for (const r of righeData) budget[r.codice] = Number(r.importo) || 0;
    return costruisciBudget(budget, n > 0 ? ceData?.voci : [], n);
  }, [righeData, ceData, n]);
  const note = useMemo(() => {
    const out: Record<string, string | null> = {};
    for (const r of righeData ?? []) out[r.codice] = r.note;
    return out;
  }, [righeData]);
  return {
    data,
    note,
    isLoading: righe.isLoading || (n > 0 && ce.isLoading),
    isError: righe.isError || (n > 0 && ce.isError),
    refetch: () => {
      void righe.refetch();
      void ce.refetch();
    },
  };
}

export function useUpsertBudget() {
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();
  return useMutation({
    mutationFn: async (input: {
      anno: number;
      codice: string;
      importo: number;
      note?: string | null;
    }) => {
      // company_id esplicito: la colonna non ha un valore predefinito e la
      // regola di sicurezza lo vuole uguale all'azienda dell'utente. Senza,
      // ogni salvataggio del budget veniva rifiutato («row-level security»).
      if (!companyId) throw new Error("Azienda non riconosciuta: ricarica la pagina.");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("cg_budget")
        .upsert({ ...input, company_id: companyId }, { onConflict: "company_id,anno,codice" })
        .select()
        .single();
      if (error) throw error;
      return data as BudgetRow;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["cg", "budget-rows", vars.anno] });
    },
  });
}
