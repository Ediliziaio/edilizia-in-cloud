/**
 * useAccessoRevocato — l'app torna al login quando il suo accesso viene chiuso
 * (revoca, blocco, «Esci» su un altro dispositivo), senza aspettare la
 * scadenza del token. Vedi src/lib/auth/accessoRevocato.ts.
 *
 * Il controllo gira ogni due minuti solo a scheda visibile, e subito al
 * ritorno sulla scheda: una scheda lasciata aperta di notte non chiede nulla.
 */
import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { avviaIntervalloVisibile } from "@/lib/intervalloVisibile";
import { creaControlloAccesso, INTERVALLO_CONTROLLO_ACCESSO_MS } from "@/lib/auth/accessoRevocato";

export function useAccessoRevocato(): void {
  useEffect(() => {
    const controllo = creaControlloAccesso({
      chiediUtente: (token) => supabase.auth.getUser(token),
      quandoChiuso: () =>
        toast.info("Sessione chiusa", {
          description: "L'accesso da questo dispositivo è stato chiuso. Accedi di nuovo per continuare.",
        }),
    });

    // Il token arriva dagli eventi auth, come in useSessionTimeout: chiamare
    // getSession() competerebbe con AuthContext sul lock dello storage.
    const { data } = supabase.auth.onAuthStateChange((_evento, sessione) => {
      controllo.aggiornaToken(sessione?.access_token ?? null);
    });

    const ferma = avviaIntervalloVisibile(() => {
      void controllo.controlla();
    }, INTERVALLO_CONTROLLO_ACCESSO_MS);

    return () => {
      ferma();
      data.subscription.unsubscribe();
    };
  }, []);
}
