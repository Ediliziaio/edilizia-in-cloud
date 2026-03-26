import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { queryKeys } from "@/lib/queryKeys";
import { toast } from "sonner";

export interface MovimentoCassa {
  id: string;
  company_id: string;
  documento_id?: string;
  importo: number;
  tipo: string;
  metodo?: string;
  riferimento?: string;
  note?: string;
  data_movimento: string;
  created_at: string;
}

export interface MovimentiFilters {
  data_da?: string;
  data_a?: string;
  tipo?: string;
  documento_id?: string;
}

export function useMovimentiCassa(filters: MovimentiFilters = {}) {
  const companyId = useEffectiveCompanyId();

  return useQuery({
    queryKey: ["movimenti-cassa", companyId, filters],
    enabled: !!companyId,
    queryFn: async () => {
      let query = supabase
        .from("movimenti_cassa_native" as never)
        .select("*")
        .eq("company_id", companyId!)
        .order("data_movimento", { ascending: false })
        .limit(500);

      if (filters.data_da) query = query.gte("data_movimento", filters.data_da);
      if (filters.data_a) query = query.lte("data_movimento", filters.data_a);
      if (filters.tipo) query = query.eq("tipo", filters.tipo);
      if (filters.documento_id) query = query.eq("documento_id", filters.documento_id);

      const { data, error } = await query;
      if (error) throw error;
      return (data as unknown as MovimentoCassa[]) ?? [];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}

export function useCreateMovimento() {
  const companyId = useEffectiveCompanyId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      documento_id: string;
      importo: number;
      metodo: string;
      data_movimento: string;
      riferimento?: string;
      note?: string;
    }) => {
      if (!companyId) throw new Error("Nessuna azienda");

      // Single atomic RPC — insert movement + update invoice inside one DB transaction.
      // Eliminates the read-modify-write race condition of the previous two-step approach.
      const { error } = await supabase.rpc("registra_incasso_atomico" as never, {
        p_company_id:     companyId,
        p_documento_id:   input.documento_id,
        p_importo:        input.importo,
        p_metodo:         input.metodo,
        p_data_movimento: input.data_movimento,
        p_riferimento:    input.riferimento ?? null,
        p_note:           input.note ?? null,
      } as never);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["movimenti-cassa"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.documentiFiscali.all });
      toast.success("Incasso registrato");
    },
    onError: (err: Error) => {
      toast.error("Errore nella registrazione", { description: err.message });
    },
  });
}

export function useDeleteMovimento() {
  const companyId = useEffectiveCompanyId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Nessuna azienda");

      // Atomic RPC: deletes movement + reverses importo_pagato on the invoice
      // inside one DB transaction, preventing partial state.
      const { error } = await supabase.rpc("storna_incasso_atomico" as never, {
        p_company_id:   companyId,
        p_movimento_id: id,
      } as never);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["movimenti-cassa"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.documentiFiscali.all });
      toast.success("Movimento eliminato");
    },
    onError: (err: Error) => {
      toast.error("Errore nell'eliminazione", { description: err.message });
    },
  });
}
