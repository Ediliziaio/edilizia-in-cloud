/**
 * Hook React Query — Imposte stimate IRES + IRAP separate.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cgRpc } from "@/hooks/controlloGestione/cgRpc";

export interface ImposteAliquote {
  ires_pct: number;
  irap_pct: number;
  addizionale_ires_pct: number;
  base_irap_include_personale: boolean;
}

export interface ImposteSezione {
  base_imponibile: number;
  aliquota: number;
  imposta: number;
}

export interface ImposteResult {
  meta: { company_id: string; anno: number; generato_il: string };
  aliquote: ImposteAliquote;
  ires: ImposteSezione;
  addizionale: ImposteSezione;
  irap: ImposteSezione;
  totali: {
    imposte_totali: number;
    utile_ante: number;
    utile_post: number;
    tax_rate_eff_pct: number | null;
  };
}

export function useImposte(anno: number) {
  return useQuery({
    queryKey: ["cg", "imposte", anno] as const,
    queryFn: async (): Promise<ImposteResult> => {
            const { data, error } = await cgRpc("cg_get_imposte_dettaglio_safe", { p_anno: anno });
      if (error) throw error;
      return data as unknown as ImposteResult;
    },
    staleTime: 60_000,
  });
}

export function useUpsertAliquote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ImposteAliquote) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("cg_aliquote_imposte")
        .upsert(input)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cg", "imposte"] });
      // Le aliquote IRES/IRAP determinano utile post-imposte e DSCR mostrati
      // negli Indici avanzati: senza questa, cambiando aliquota quei numeri
      // restavano fermi fino allo staleTime.
      qc.invalidateQueries({ queryKey: ["cg", "indici-avanzati"] });
    },
  });
}
