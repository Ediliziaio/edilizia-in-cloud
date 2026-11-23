import { useCallback, useRef } from "react";

/**
 * Un'azione alla volta, bloccata SUBITO al primo tocco.
 *
 * `disabled={isPending}` vale solo dal disegno successivo: due tocchi nello stesso istante (telefono lento)
 * passavano entrambi e la timbratura scriveva due entrate a 1 ms l'una dall'altra (collaudo 23/11/2026).
 * L'azione restituisce la promessa della richiesta (`mutateAsync`): il blocco si toglie appena finisce, bene o
 * male. L'errore lo mostra già chi ha creato la mutazione (onError), qui non si ripete.
 */
export function useUnaVolta() {
  const inVolo = useRef(false);
  return useCallback((azione: () => Promise<unknown>): void => {
    if (inVolo.current) return;
    inVolo.current = true;
    let richiesta: Promise<unknown>;
    try {
      richiesta = azione();
    } catch (errore) {
      inVolo.current = false;
      throw errore;
    }
    void Promise.resolve(richiesta).catch(() => {}).finally(() => { inVolo.current = false; });
  }, []);
}
