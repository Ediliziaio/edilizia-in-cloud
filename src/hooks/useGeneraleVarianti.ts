// src/hooks/useGeneraleVarianti.ts
// Varianti chieste dagli acquirenti delle unità: una lettura per tutta la generale
// (generale_varianti_elenco, migrazione 20281105120000) e la scadenza delle scelte.
// Proposta, documento, firma e approvazione passano dal flusso delle varianti di commessa
// (VariationLifecycleDialog): dopo, si rileggono unità, piano e riepilogo.
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { chiaviGenerali } from "@/hooks/useCommesseGenerali";
import { leggiVarianti, type DatiVarianti } from "@/lib/orders/generali/varianti";

// RPC non ancora nei tipi generati: cast localizzato.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const chiaviVarianti = {
  elenco: (generaleId: string | undefined) => ["generale-varianti", generaleId] as const,
};

/** Le varianti della generale; null se non si leggono (le unità restano senza, senza errori). */
export async function caricaVarianti(generaleId: string): Promise<DatiVarianti | null> {
  try {
    const { data, error } = await db.rpc("generale_varianti_elenco", { p_generale_id: generaleId });
    if (error) return null;
    return leggiVarianti(data);
  } catch {
    return null;
  }
}

export function useVariantiGenerale(generaleId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: chiaviVarianti.elenco(generaleId),
    enabled: !!generaleId && enabled,
    staleTime: 60_000,
    meta: { silent: true },
    queryFn: () => caricaVarianti(generaleId!),
  });
}

/** Una variante cambiata cambia il prezzo dell'unità, il margine e il piano. */
export function rileggiDopoVariante(qc: QueryClient, generaleId: string) {
  void qc.invalidateQueries({ queryKey: chiaviVarianti.elenco(generaleId) });
  void qc.invalidateQueries({ queryKey: ["generale-unita", generaleId] });
  void qc.invalidateQueries({ queryKey: chiaviGenerali.riepilogo(generaleId) });
}

export function useScadenzaVariante(generaleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ variazioneId, scadenza }: { variazioneId: string; scadenza: string | null }) => {
      const { error } = await db.rpc("generale_variante_scadenza", { p_variazione_id: variazioneId, p_scadenza: scadenza });
      if (error) throw error;
    },
    onSuccess: () => rileggiDopoVariante(qc, generaleId),
  });
}
