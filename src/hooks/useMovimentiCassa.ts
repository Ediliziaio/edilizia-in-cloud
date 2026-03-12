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

      // 1. Insert movement
      const { error: insertErr } = await supabase
        .from("movimenti_cassa_native" as never)
        .insert({
          company_id: companyId,
          documento_id: input.documento_id,
          importo: input.importo,
          tipo: "incasso",
          metodo: input.metodo,
          data_movimento: input.data_movimento,
          riferimento: input.riferimento ?? null,
          note: input.note ?? null,
        } as never);

      if (insertErr) throw insertErr;

      // 2. Update linked invoice
      const { data: doc, error: fetchErr } = await supabase
        .from("documenti_fiscali" as never)
        .select("totale_da_pagare, importo_pagato")
        .eq("id", input.documento_id)
        .single();

      if (fetchErr) throw fetchErr;
      const d = doc as unknown as { totale_da_pagare: number; importo_pagato: number };
      const nuovoPagato = d.importo_pagato + input.importo;
      const nuovoStato = nuovoPagato >= d.totale_da_pagare ? "pagata" : "parzialmente_pagata";

      const { error: updateErr } = await supabase
        .from("documenti_fiscali" as never)
        .update({
          importo_pagato: nuovoPagato,
          stato: nuovoStato,
          pagato_at: nuovoStato === "pagata" ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", input.documento_id);

      if (updateErr) throw updateErr;
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
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Get the movement first to know the amount
      const { data: mov, error: fetchErr } = await supabase
        .from("movimenti_cassa_native" as never)
        .select("*")
        .eq("id", id)
        .single();

      if (fetchErr) throw fetchErr;
      const m = mov as unknown as MovimentoCassa;

      // Delete movement
      const { error: delErr } = await supabase
        .from("movimenti_cassa_native" as never)
        .delete()
        .eq("id", id);

      if (delErr) throw delErr;

      // Recalculate invoice payment
      if (m.documento_id) {
        const { data: doc, error: docErr } = await supabase
          .from("documenti_fiscali" as never)
          .select("totale_da_pagare, importo_pagato")
          .eq("id", m.documento_id)
          .single();

        if (!docErr && doc) {
          const d = doc as unknown as { totale_da_pagare: number; importo_pagato: number };
          const nuovoPagato = Math.max(0, d.importo_pagato - m.importo);
          const nuovoStato = nuovoPagato <= 0 ? "emessa" : "parzialmente_pagata";

          await supabase
            .from("documenti_fiscali" as never)
            .update({
              importo_pagato: nuovoPagato,
              stato: nuovoStato,
              pagato_at: null,
              updated_at: new Date().toISOString(),
            } as never)
            .eq("id", m.documento_id);
        }
      }
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
