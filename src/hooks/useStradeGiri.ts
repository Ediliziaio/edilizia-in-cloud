/**
 * I percorsi stradali dei giri della Programmazione (26/11/2026).
 *
 * Una sola chiave di cache per giro (i punti nell'ordine), condivisa fra le viste:
 *  - la Mappa li CHIEDE (`chiedi: true`) alla edge mappa-operativa → HERE senza
 *    traffico, con tetto giornaliero e cache di un giorno sul server;
 *  - Persone e Giorno li LEGGONO soltanto (`chiedi: false`): se la mappa li ha già
 *    presi usano la strada vera, altrimenti la stima in linea d'aria. Aprire
 *    quelle viste non consuma mai HERE (Florin: «HERE solo quando si apre la mappa»).
 */
import { useQueries } from "@tanstack/react-query";
import { servizioMappa } from "@/components/calendar/mappa/servizio";
import type { Punto } from "@/lib/programmazione/giornata";
import type { PercorsoStradale } from "../../shared/mappa-operativa/calcoli";

export const chiaveStrada = (companyId: string | null, punti: Punto[]) =>
  ["programmazione", "strada", companyId, punti.map((x) => `${x.lat.toFixed(5)},${x.lng.toFixed(5)}`).join(";")] as const;

export function useStradeGiri(companyId: string | null, giri: Punto[][], { chiedi }: { chiedi: boolean }) {
  return useQueries({
    queries: giri.map((punti) => ({
      queryKey: chiaveStrada(companyId, punti),
      enabled: chiedi && !!companyId && punti.length >= 2 && punti.length <= 25,
      staleTime: 30 * 60_000,
      gcTime: 60 * 60_000,
      retry: false,
      meta: { silent: true },
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        servizioMappa<PercorsoStradale>(companyId!, "lavori", { azione: "percorso", punti, profilo: "auto" }, signal),
    })),
  });
}
