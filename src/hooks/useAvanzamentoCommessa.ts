// src/hooks/useAvanzamentoCommessa.ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePesoMediaFasi } from "@/hooks/usePesoMediaFasi";
import { avanzamentoDaMostrare, type PesoMedia } from "@/lib/orders/avanzamentoCommessa";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/**
 * L'avanzamento della commessa come lo ha calcolato il database, col peso scelto dall'azienda.
 * Si legge **solo** se l'azienda ha scelto un peso diverso da «alla pari»: con «alla pari»
 * le schermate tengono il loro calcolo di sempre e non parte nessuna lettura in più.
 */
export function useAvanzamentoCommessa(orderId: string | null | undefined) {
  const { pesoMedia } = usePesoMediaFasi();
  const { data } = useQuery({
    queryKey: ["order-avanzamento", orderId],
    enabled: !!orderId && pesoMedia !== "uguale",
    staleTime: 30_000,
    retry: false,
    queryFn: async (): Promise<number | null> => {
      const { data: riga, error } = await db.from("orders").select("percentuale_avanzamento").eq("id", orderId!).maybeSingle();
      if (error || riga?.percentuale_avanzamento == null) return null;
      return Number(riga.percentuale_avanzamento);
    },
  });
  const percentuale = data ?? null;
  const peso: PesoMedia = pesoMedia;
  return {
    percentuale,
    peso,
    /** Il numero da mostrare, dato quello che la schermata calcolerebbe da sola. */
    daMostrare: <T extends number | null>(locale: T): T | number => avanzamentoDaMostrare(locale, { percentuale, peso }),
  };
}
