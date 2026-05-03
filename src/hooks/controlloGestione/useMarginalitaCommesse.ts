/**
 * Hook React Query — Marginalita per commessa/cantiere.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Semaforo = "verde" | "giallo" | "rosso" | "grigio";

export interface CommessaRiga {
  id: string;
  order_code: string | null;
  description: string;
  cliente: string | null;
  status: string | null;
  pct_avanzamento: number;
  work_start: string | null;
  work_end: string | null;
  preventivo: number;
  consuntivo: number;
  costo_acquisti: number;
  costo_errori: number;
  variazioni: number;
  margine: number;
  margine_perc: number;
  costo_atteso: number | null;
  margine_atteso: number | null;
  margine_atteso_perc: number | null;
  semaforo: Semaforo;
}

export interface CommesseKPI {
  n_commesse: number;
  n_in_corso: number;
  n_completate: number;
  preventivo_totale: number;
  consuntivo_totale: number;
  margine_totale: number;
  margine_atteso_totale: number;
  n_in_perdita: number;
}

export interface MarginalitaCommesseResult {
  meta: {
    company_id: string;
    anno: number | null;
    status_filter: string | null;
    generato_il: string;
  };
  kpi: CommesseKPI;
  righe: CommessaRiga[];
}

export function useMarginalitaCommesse(
  anno: number | null = null,
  statusFilter: string | null = null,
) {
  return useQuery({
    queryKey: ["cg", "commesse", anno, statusFilter] as const,
    queryFn: async (): Promise<MarginalitaCommesseResult> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)(
        "cg_get_marginalita_commesse_safe",
        { p_anno: anno, p_status_filter: statusFilter },
      );
      if (error) throw error;
      return data as unknown as MarginalitaCommesseResult;
    },
    staleTime: 60_000,
  });
}
