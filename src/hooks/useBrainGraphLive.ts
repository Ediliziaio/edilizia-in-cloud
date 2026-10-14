import { useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createLiveRefresh } from "@/lib/realtime/createLiveRefresh";

/**
 * Il cervello AI in tempo reale, senza una ricarica per ogni riga (12/10/2026).
 *
 * Il grafo rileggeva le memorie a ogni evento del tempo reale, annullando la
 * lettura precedente (che sul database continuava): il popolamento demo ne
 * genera uno per memoria, e il 12/10 sono partite 84 ricariche in un minuto.
 * Ora gli eventi passano dalla coda comune, come contatti e opportunità: una
 * ricarica alla volta, la prima un secondo dopo l'evento, poi almeno 15
 * secondi o cinque volte quanto è durata l'ultima, fino a 2 minuti; niente con
 * la scheda nascosta. Durante un popolamento (`sospendi`) gli eventi
 * aspettano, e alla fine (`riprendi`) parte una ricarica sola.
 */
export function useBrainGraphLive(opzioni: {
  isAdmin: boolean;
  companyId: string | null | undefined;
  /** A ogni evento, per l'indicatore LIVE: non ricarica niente. */
  onEvento?: () => void;
}) {
  const { isAdmin, companyId, onEvento } = opzioni;
  const qc = useQueryClient();
  const codaRef = useRef<ReturnType<typeof createLiveRefresh> | null>(null);
  const sospesoRef = useRef(false);
  const onEventoRef = useRef(onEvento);
  useEffect(() => { onEventoRef.current = onEvento; }, [onEvento]);

  useEffect(() => {
    if (!isAdmin && !companyId) return;
    const memorie = ["brain-graph-memories"];
    const coda = createLiveRefresh({
      // Solo eventi e ritorno sulla scheda: il grafo non ha mai avuto un giro fisso.
      heartbeat: null,
      busy: () => sospesoRef.current || qc.isFetching({ queryKey: memorie }) > 0,
      refresh: () => qc.invalidateQueries({ queryKey: memorie }, { cancelRefetch: false }),
    });
    codaRef.current = coda;
    const table = isAdmin ? "silvio_persona_memory" : "ai_persona_memory";
    const canale = supabase
      .channel(isAdmin ? "brain-graph-rt-admin" : `brain-graph-rt-${companyId}`)
      .on(
        "postgres_changes",
        isAdmin
          ? { event: "*", schema: "public", table }
          : { event: "*", schema: "public", table, filter: `company_id=eq.${companyId}` },
        () => {
          onEventoRef.current?.();
          coda.request();
        },
      )
      .subscribe();
    return () => {
      coda.dispose();
      if (codaRef.current === coda) codaRef.current = null;
      void supabase.removeChannel(canale);
    };
  }, [companyId, isAdmin, qc]);

  return useMemo(() => ({
    sospendi: () => { sospesoRef.current = true; },
    riprendi: () => {
      sospesoRef.current = false;
      // Anche senza eventi (tempo reale giù) il grafo si rilegge una volta.
      codaRef.current?.request();
    },
  }), []);
}
