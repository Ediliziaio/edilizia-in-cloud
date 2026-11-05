import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ATTESA_CONFERMA_MS,
  INTERVALLO_PERIODICO_MS,
  ascoltaAltreSchede,
  confrontaAziende,
  controlloDovuto,
  type EsitoConfronto,
} from "@/lib/auth/aziendaServer";

const ALLINEATA: EsitoConfronto = { stato: "allineata" };

/**
 * Chiede al server quale azienda sta usando e la confronta con `aziendaMostrata`.
 *
 * Non sta sul percorso delle richieste: legge all'apertura, al ritorno sulla
 * scheda, quando un'altra scheda avvisa e una volta al minuto a scheda visibile.
 * `aziendaMostrata` null spegne tutto, senza nessuna chiamata.
 *
 * Una lettura fallita non dice niente e lascia l'esito com'era: una rete
 * ballerina non deve accendere l'avviso, né spegnerlo.
 */
export function useAziendaDelServer(aziendaMostrata: string | null) {
  const [esito, setEsito] = useState<EsitoConfronto>(ALLINEATA);
  const mostrataRef = useRef(aziendaMostrata);
  mostrataRef.current = aziendaMostrata;
  const ultimoControllo = useRef<number | null>(null);
  const attesaConferma = useRef<number | null>(null);

  const leggi = useCallback(async (): Promise<EsitoConfronto | null> => {
    const chiesta = mostrataRef.current;
    if (!chiesta) return null;
    try {
      const { data, error } = await supabase.rpc("get_my_company_id");
      // Nel frattempo questa scheda ha cambiato azienda: risposta da buttare.
      if (error || mostrataRef.current !== chiesta) return null;
      return confrontaAziende(chiesta, data);
    } catch {
      return null;
    }
  }, []);

  const controlla = useCallback(
    async (forza = false) => {
      const ora = Date.now();
      if (!mostrataRef.current) return;
      if (!forza && !controlloDovuto(ultimoControllo.current, ora)) return;
      ultimoControllo.current = ora;

      const prima = await leggi();
      if (!prima) return;
      if (prima.stato === "allineata") {
        if (attesaConferma.current !== null) window.clearTimeout(attesaConferma.current);
        attesaConferma.current = null;
        setEsito(ALLINEATA);
        return;
      }
      // Il cambio d'azienda di questa stessa scheda aggiorna lo stato prima di
      // scrivere sul server: una differenza si crede solo se resta tale.
      if (attesaConferma.current !== null) return;
      attesaConferma.current = window.setTimeout(async () => {
        attesaConferma.current = null;
        const seconda = await leggi();
        if (seconda) setEsito(seconda);
      }, ATTESA_CONFERMA_MS);
    },
    [leggi],
  );

  useEffect(() => {
    setEsito(ALLINEATA);
    if (!aziendaMostrata) return;

    void controlla(true);
    const seVisibile = () => {
      if (document.visibilityState === "visible") void controlla();
    };
    const altraScheda = (): void => {
      void controlla(true);
    };

    document.addEventListener("visibilitychange", seVisibile);
    window.addEventListener("focus", seVisibile);
    const smetti = ascoltaAltreSchede(altraScheda);
    const giro = window.setInterval(seVisibile, INTERVALLO_PERIODICO_MS);

    return () => {
      document.removeEventListener("visibilitychange", seVisibile);
      window.removeEventListener("focus", seVisibile);
      smetti();
      window.clearInterval(giro);
      if (attesaConferma.current !== null) window.clearTimeout(attesaConferma.current);
      attesaConferma.current = null;
    };
  }, [aziendaMostrata, controlla]);

  return { esito, ricontrolla: () => controlla(true) };
}
