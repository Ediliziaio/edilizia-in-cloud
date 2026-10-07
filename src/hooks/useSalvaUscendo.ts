/**
 * Uscendo da un preventivo, quello che si è appena scritto si salva lo stesso.
 *
 * I wizard dei preventivi edili salvano da soli 2 secondi dopo l'ultima modifica. Se la
 * pagina si chiude prima (freccia «Esci», menu dell'app, «indietro» del telefono) il timer
 * si spegne con lei e la modifica non parte mai. Qui, allo smontaggio, se c'è qualcosa
 * ancora da salvare lo si invia: senza aspettare e senza bloccare l'uscita, come fa già lo
 * step Computo con le sue voci. Vale per i preventivi già creati: uno nuovo ha il suo dialogo
 * «Salvare come bozza?».
 */
import { useEffect, useRef } from "react";

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

export function useSalvaUscendo<T extends object>({ id, dirty, form, salva }: Opzioni<T>): void {
  // Sempre gli ultimi valori: lo smontaggio parte con le variabili di quando l'effetto è nato.
  const ultimo = useRef({ id, dirty, form, salva });
  useEffect(() => {
    ultimo.current = { id, dirty, form, salva };
  });

  useEffect(() => () => {
    const { id: idAllaFine, dirty: daSalvare, form: modulo, salva: invia } = ultimo.current;
    if (!daSalvare || !idAllaFine) return;
    // Un errore qui non può più essere detto a nessuno: la pagina non c'è più. Resta l'avviso
    // di «modifiche non salvate» che il wizard mostrava finché la modifica era in sospeso.
    void invia({ ...modulo, id: idAllaFine }).catch((): void => undefined);
  }, []);
}
