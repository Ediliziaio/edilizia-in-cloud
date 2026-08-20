/**
 * useListinoCliente — lo sconto concordato con un contatto CRM.
 *
 * Lettura tollerante: se la tabella non e' ancora attiva (migration da
 * applicare) si degrada a null senza rompere ne' la scheda contatto ne'
 * il preventivatore.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ListinoCliente {
  id: string;
  sconto_globale_pct: number;
  attivo: boolean;
  note: string | null;
}

export function useListinoCliente(contactId: string | null | undefined) {
  const query = useQuery({
    queryKey: ["listino-cliente", contactId],
    queryFn: async (): Promise<ListinoCliente | null> => {
      // `as any`: tabella nuova (migration 20280202000000), fuori dai tipi
      // generati — convenzione di progetto.
      const { data, error } = await (supabase as any)
        .from("listini_cliente")
        .select("id, sconto_globale_pct, attivo, note")
        .eq("contact_id", contactId)
        .maybeSingle();
      if (error) return null;
      return (data as ListinoCliente) ?? null;
    },
    enabled: !!contactId,
    staleTime: 60_000,
  });
  return { listino: query.data ?? null, isLoading: query.isLoading };
}
