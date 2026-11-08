// Materiali da rivedere dopo una perizia di variante approvata (materiali_variazioni,
// migrazione 20281222190000).
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// La tabella è nuova e non è ancora nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface VariazioneMateriale {
  id: string;
  tipo: "cambia" | "nuova_voce";
  descrizione: string;
  unita_misura: string | null;
  quantita_prima: number | null;
  quantita_dopo: number | null;
}

export const chiaveVariazioni = (orderId: string) => ["materiali-variazioni", orderId] as const;

export function useVariazioniVariante(orderId: string) {
  return useQuery({
    queryKey: chiaveVariazioni(orderId),
    enabled: !!orderId,
    queryFn: async (): Promise<VariazioneMateriale[]> => {
      const { data, error } = await db
        .from("materiali_variazioni")
        .select("id, tipo, descrizione, unita_misura, quantita_prima, quantita_dopo")
        .eq("order_id", orderId)
        .eq("stato", "da_confermare")
        .order("tipo")
        .order("descrizione");
      if (error) throw error;
      return (data ?? []) as VariazioneMateriale[];
    },
  });
}

