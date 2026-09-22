/**
 * Il voto dell'azienda su Google, Trustpilot… (companies.recensioni_online): lo
 * scrive il Profilo azienda, lo mostrano gli editor dei modelli accanto alle
 * testimonianze, lo stampano i preventivi nella pagina «Dicono di noi».
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { leggiVotiOnline, type VotoOnline } from "../../supabase/functions/_shared/recensioniOnline";

export const chiaveVotiOnline = (companyId: string | null) => ["voti-online", companyId] as const;

export function useVotiOnline(): { voti: VotoOnline[]; grezzo: unknown[]; caricato: boolean } {
  const companyId = useEffectiveCompanyId();
  const { data, isSuccess } = useQuery<unknown[]>({
    queryKey: chiaveVotiOnline(companyId),
    enabled: !!companyId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data: riga, error } = await supabase
        .from("companies")
        .select("recensioni_online")
        .eq("id", companyId!)
        .maybeSingle();
      if (error) throw error;
      const valore = (riga as { recensioni_online?: unknown } | null)?.recensioni_online;
      return Array.isArray(valore) ? valore : [];
    },
  });
  const grezzo = data ?? [];
  // Tutti quelli validi (fino a sei): il PDF poi ne stampa tre.
  return { voti: leggiVotiOnline(grezzo, 6), grezzo, caricato: isSuccess };
}

/** Dopo un salvataggio: rileggi il voto ovunque lo si mostri. */
export function useAggiornaVotiOnline(): () => Promise<void> {
  const companyId = useEffectiveCompanyId();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: chiaveVotiOnline(companyId) });
}
