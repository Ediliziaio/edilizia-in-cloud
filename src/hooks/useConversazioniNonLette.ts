/**
 * useConversazioniNonLette — Conta le conversazioni (WhatsApp/email/IG/…) con
 * messaggi da leggere, per il badge «Chat» nella sidebar. È lo stesso «Non lette N»
 * della pagina Chat.
 *
 * Usa la RPC leggera `conversazioni_non_lette` (un solo intero) invece di
 * scaricare tutta la lista inbox su ogni pagina. L'inbox non ha realtime sulle
 * tabelle sorgente, quindi: refetch al rientro sulla scheda + polling leggero
 * mentre la scheda è visibile.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useConversazioniNonLette(): number {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data = 0 } = useQuery({
    queryKey: ["conversazioni-non-lette", companyId],
    enabled: !!companyId,
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      // Cast tipato: la RPC non è nei tipi generati.
      const rpc = supabase.rpc.bind(supabase) as unknown as (
        fn: string,
        args: Record<string, string>,
      ) => Promise<{ data: number | null; error: unknown }>;
      // Chi non ha accesso alle conversazioni riceve un errore dalla RPC: il
      // badge resta a zero, la sidebar non si rompe.
      const { data, error } = await rpc.call(supabase, "conversazioni_non_lette", {
        p_company_id: companyId!,
      });
      if (error || typeof data !== "number") return 0;
      return data;
    },
  });

  return data as number;
}
