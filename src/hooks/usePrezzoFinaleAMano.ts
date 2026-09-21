/**
 * Il prezzo del preventivo scritto a mano: si può fare solo se l'azienda l'ha
 * acceso in Impostazioni → Margini (preventivo_impostazioni.prezzo_finale_a_mano).
 *
 * Serve a chi usa i preventivatori per avere un bel documento ma non carica i
 * prezzi del listino: le voci restano a 0 € e il prezzo si scrive alla fine,
 * nella fase Economia. È il prezzo pieno IVA esclusa: sconto e IVA si
 * calcolano sopra.
 *
 * Si legge per l'azienda del preventivo, non per quella dell'utente: un super
 * admin che apre il preventivo di un'altra azienda vede le sue regole.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const chiavePrezzoFinaleAMano = (companyId: string | null | undefined) =>
  // Sotto ["preventivo-impostazioni", companyId]: quando la pagina Margini
  // salva le sue impostazioni, si rilegge anche questa.
  ["preventivo-impostazioni", companyId ?? null, "prezzo-finale-a-mano"] as const;

export function usePrezzoFinaleAMano(companyId: string | null | undefined) {
  return useQuery({
    queryKey: chiavePrezzoFinaleAMano(companyId),
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<boolean> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("preventivo_impostazioni")
        .select("prezzo_finale_a_mano")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      return data?.prezzo_finale_a_mano === true;
    },
  });
}

/**
 * Accende o spegne l'opzione. Passa da una funzione del database e non
 * dall'upsert della pagina Margini, che riscrive tutte le sue opzioni coi
 * valori mostrati: accendere questa avrebbe cambiato anche le altre.
 */
export function useImpostaPrezzoFinaleAMano(companyId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (attivo: boolean) => {
      if (!companyId) throw new Error("Azienda mancante");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc("preventivo_imposta_prezzo_finale_a_mano", {
        p_company_id: companyId,
        p_attivo: attivo,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chiavePrezzoFinaleAMano(companyId) });
    },
  });
}
