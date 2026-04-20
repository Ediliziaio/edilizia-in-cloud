/**
 * Hook mutations per assegnazioni variante costo su righe preventivo.
 *
 * Sprint B — Varianti Costo Manodopera.
 *
 * Pattern:
 *   · assignVariante  → upsert on conflict quote_item_id
 *     snapshot `costo_bloccato` dal costo corrente della variante
 *   · updateStato     → cambia stato assegnazione (proposta→confermata→...)
 *   · removeAssegnazione → delete hard (preferibile allo stato annullata)
 *   · refreshCostoBloccato → ri-esegue snapshot dal costo variante corrente
 *     (usato quando l'admin vuole "aggiornare al prezzo nuovo" senza cambiare variante)
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type {
  PreventivoManodoperaAssegnazione,
  StatoAssegnazione,
} from "@/types/costVariants";

export interface AssignVarianteParams {
  quoteId: string;
  quoteItemId: string;
  tariffaId: string;
  varianteId: string;
  /** Snapshot del costo al momento dell'assegnazione (da `TariffaCostoVariante.costo`). */
  costo: number;
  note?: string;
  stato?: StatoAssegnazione;
}

export function useAssegnazioniMutations() {
  const qc = useQueryClient();
  const { user, effectiveCompany } = useAuth();

  const invalidate = (quoteId?: string) => {
    qc.invalidateQueries({ queryKey: ["margine-breakdown"] });
    qc.invalidateQueries({ queryKey: ["assegnazioni-preventivo", quoteId] });
  };

  const assignVariante = useMutation({
    mutationFn: async (params: AssignVarianteParams) => {
      if (!effectiveCompany?.id) throw new Error("Nessuna azienda selezionata");
      const payload = {
        company_id: effectiveCompany.id,
        quote_id: params.quoteId,
        quote_item_id: params.quoteItemId,
        tariffa_id: params.tariffaId,
        variante_id: params.varianteId,
        costo_bloccato: params.costo,
        costo_bloccato_at: new Date().toISOString(),
        stato: params.stato ?? "proposta",
        note: params.note ?? null,
        created_by: user?.id ?? null,
      };
      // Upsert su quote_item_id: se esiste già, sovrascrive (nuova variante scelta).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from as any)(
        "preventivo_manodopera_assegnazioni"
      )
        .upsert(payload, { onConflict: "quote_item_id" })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as PreventivoManodoperaAssegnazione;
    },
    onSuccess: (_data, vars) => invalidate(vars.quoteId),
  });

  const updateStato = useMutation({
    mutationFn: async (params: {
      quoteItemId: string;
      stato: StatoAssegnazione;
      note?: string;
    }) => {
      const patch: Record<string, unknown> = { stato: params.stato };
      if (params.note !== undefined) patch.note = params.note;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from as any)(
        "preventivo_manodopera_assegnazioni"
      )
        .update(patch)
        .eq("quote_item_id", params.quoteItemId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as PreventivoManodoperaAssegnazione;
    },
    onSuccess: (data) => invalidate(data.quote_id),
  });

  const removeAssegnazione = useMutation({
    mutationFn: async (params: { quoteItemId: string; quoteId?: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from as any)(
        "preventivo_manodopera_assegnazioni"
      )
        .delete()
        .eq("quote_item_id", params.quoteItemId);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_data, vars) => invalidate(vars.quoteId),
  });

  return { assignVariante, updateStato, removeAssegnazione };
}
