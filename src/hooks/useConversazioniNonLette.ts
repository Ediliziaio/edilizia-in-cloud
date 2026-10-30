/**
 * useConversazioniNonLette — Conta le conversazioni (WhatsApp/email/IG/…) con
 * messaggi da leggere, per il badge «Chat» nella sidebar. È lo stesso «Non lette N»
 * della pagina Chat.
 *
 * Usa la RPC leggera `conversazioni_non_lette` (un solo intero) invece di
 * scaricare tutta la lista inbox su ogni pagina. L'inbox non ha realtime sulle
 * tabelle sorgente, quindi: refetch al rientro sulla scheda + polling leggero
 * mentre la scheda è visibile.
 *
 * 12/10/2026: il badge è in ogni pagina di ogni utente (3.006 chiamate da 19
 * utenti nelle 24 ore fino al 12/10), e girava ogni 30 secondi anche quando
 * una risposta impiegava quasi 20 secondi. Ora il giro successivo parte dopo
 * 30 secondi, o cinque volte quanto è durato l'ultimo, fino a 2 minuti; a
 * scheda nascosta non parte (React Query guarda document.visibilityState), e
 * un giro non si sovrappone al precedente.
 *
 * 31/10/2026: 175.000 chiamate in 14 giorni (12.500 al giorno, 18 ms l'una):
 * il giro base passa da 30 a 90 secondi, il massimo da 2 a 5 minuti. È il
 * numero sul menu, non la chat: la pagina Chat ha i suoi tempi.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const NON_LETTE_GIRO_MS = 90_000;
const NON_LETTE_GIRO_MASSIMO_MS = 300_000;

/** Attesa prima del giro successivo, data la durata dell'ultimo. */
export function attesaNonLette(durataUltimaMs: number): number {
  return Math.min(NON_LETTE_GIRO_MASSIMO_MS, Math.max(NON_LETTE_GIRO_MS, durataUltimaMs * 5));
}

/** Il conteggio, e quanto ci ha messo il database a darlo. */
interface ConteggioNonLette {
  n: number;
  durataMs: number;
}

export function useConversazioniNonLette(): number {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data = 0 } = useQuery({
    queryKey: ["conversazioni-non-lette", companyId],
    enabled: !!companyId,
    // Anche il ritorno sulla scheda aspetta lo stesso tempo del giro.
    staleTime: (query) => attesaNonLette(query.state.data?.durataMs ?? 0),
    refetchInterval: (query) => attesaNonLette(query.state.data?.durataMs ?? 0),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    select: (conteggio: ConteggioNonLette) => conteggio.n,
    queryFn: async (): Promise<ConteggioNonLette> => {
      const inizio = Date.now();
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
      return { n: error || typeof data !== "number" ? 0 : data, durataMs: Date.now() - inizio };
    },
  });

  return data;
}
