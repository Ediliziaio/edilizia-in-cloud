/**
 * Uscendo da un preventivo, quello che si è appena scritto si salva lo stesso.
 *
 * I wizard dei preventivi edili salvano da soli 2 secondi dopo l'ultima modifica. Se la
 * pagina si chiude prima il timer si spegne con lei e la modifica non parte mai. Qui, allo
 * smontaggio, se c'è qualcosa ancora da salvare lo si invia: senza aspettare e senza
 * bloccare l'uscita, come fa già lo step Computo con le sue voci. Vale per i preventivi già
 * creati: uno nuovo ha il suo dialogo «Salvare come bozza?».
 *
 * È la rete di sicurezza per le uscite che il wizard non controlla (un link della barra
 * laterale, «indietro» del browser o del telefono). La freccia «Esci» non si affida a lei:
 * salva ORA, esce solo se il salvataggio riesce, e poi dice qui che non resta niente
 * (`segnaSalvato`), così la chiusura non risalva la stessa cosa. Se il salvataggio
 * all'uscita fallisce lo dice un avviso, uno solo: la pagina non c'è più e le modifiche
 * non tornano da sole.
 */
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

interface Opzioni<T extends object> {
  /** L'id del preventivo; senza, il preventivo non è ancora stato creato e non si salva da qui. */
  id: string | undefined;
  /** Ci sono modifiche che il database non ha ancora. */
  dirty: boolean;
  /** Il modulo del preventivo come sta a video. */
  form: T;
  /** Il salvataggio del wizard (`useUpsertProgetto().mutateAsync`). */
  salva: (patch: T & { id: string }) => Promise<unknown>;
}

export interface SalvaUscendo<T extends object> {
  /**
   * Questo modulo è già stato scritto sul database (lo ha fatto la freccia «Esci»): alla chiusura non si risalva.
   * Conta l'oggetto, non il suo contenuto: se dopo si scrive ancora, il modulo cambia e la chiusura lo salva.
   */
  segnaSalvato: (modulo: T) => void;
}

/** Un solo avviso alla volta, anche se più uscite falliscono di fila. */
const ID_AVVISO = "salva-uscendo";

export function useSalvaUscendo<T extends object>({ id, dirty, form, salva }: Opzioni<T>): SalvaUscendo<T> {
  // Sempre gli ultimi valori: lo smontaggio parte con le variabili di quando l'effetto è nato.
  const ultimo = useRef({ id, dirty, form, salva });
  useEffect(() => {
    ultimo.current = { id, dirty, form, salva };
  });
  // L'ultimo modulo che la freccia «Esci» ha già scritto: «dirty» da solo non basta, perché dopo il salvataggio la
  // pagina si smonta prima di rifarsi con «dirty» a falso.
  const giaSalvato = useRef<T | null>(null);

  useEffect(() => () => {
    const { id: idAllaFine, dirty: daSalvare, form: modulo, salva: invia } = ultimo.current;
    if (!daSalvare || !idAllaFine) return;
    if (modulo === giaSalvato.current) return;
    void invia({ ...modulo, id: idAllaFine }).catch((errore: unknown) => {
      toast.error("Modifiche non salvate", {
        id: ID_AVVISO,
        description: `${errore instanceof Error ? errore.message : "Errore sconosciuto"}. Riapri il preventivo e controlla l'ultima modifica.`,
      });
    });
  }, []);

  const segnaSalvato = useCallback((modulo: T) => {
    giaSalvato.current = modulo;
  }, []);
  return { segnaSalvato };
}
