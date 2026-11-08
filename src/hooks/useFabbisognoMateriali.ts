import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { RigaFabbisogno } from "@/lib/acquisti/fabbisogno";
import { ordinaDalFabbisogno } from "@/lib/acquisti/ordinaDalFabbisogno";

// La funzione è nuova e non è ancora nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/**
 * I materiali ancora da ordinare (o da verificare) di tutte le commesse, solo
 * delle fasi validate dal tecnico, già ordinati per «entro quando». Una pagina
 * da 500 righe: oltre, il cruscotto lo dice.
 */
export function useFabbisognoMateriali() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useQuery({
    queryKey: ["fabbisogno-materiali", companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<RigaFabbisogno[]> => {
      const { data, error } = await db.rpc("materiali_riconciliazione_azienda", {
        p_company: companyId, p_solo_aperti: true, p_limite: 500, p_da: 0,
      });
      if (error) throw error;
      return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        ...(r as unknown as RigaFabbisogno),
        previsto: Number(r.previsto ?? 0),
        ordinato: Number(r.ordinato ?? 0),
        in_bozza: Number(r.in_bozza ?? 0),
        ricevuto: Number(r.ricevuto ?? 0),
        residuo: Number(r.residuo ?? 0),
        eccedenza: Number(r.eccedenza ?? 0),
      }));
    },
  });
}

/**
 * La data in cui i materiali servono in cantiere (null = l'inizio della fase).
 * Sposta «ordina entro»: il fabbisogno si ricarica.
 */
export function useImpostaDataFabbisogno() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, data }: { ids: string[]; data: string | null }) => {
      const { data: n, error } = await db.rpc("materiali_data_fabbisogno_imposta", { p_items: ids, p_data: data });
      if (error) throw error;
      return Number(n ?? 0);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fabbisogno-materiali"] });
      queryClient.invalidateQueries({ queryKey: ["order-items"] });
      queryClient.invalidateQueries({ queryKey: ["materiali-per-fase"] });
    },
  });
}

/** Le bozze d'ordine dai materiali selezionati: una per commessa e fornitore. */
export function useOrdinaDalFabbisogno() {
  const queryClient = useQueryClient();
  const { effectiveCompany, user } = useAuth();
  return useMutation({
    mutationFn: (righe: RigaFabbisogno[]) => {
      if (!effectiveCompany?.id) throw new Error("Azienda non disponibile");
      return ordinaDalFabbisogno({ companyId: effectiveCompany.id, userId: user?.id, righe });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["fabbisogno-materiali"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["material-procurement"] });
      queryClient.invalidateQueries({ queryKey: ["linked-purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["materiali-per-fase"] });
    },
  });
}
