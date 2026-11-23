import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Un campo di ricerca che risponde subito alla tastiera, mentre la pagina lo
 * segue con un attimo di ritardo (23/11/2026).
 *
 * Nelle fatture ricevute il campo era «controllato» dalla pagina: ogni lettera
 * ridisegnava tutta la pagina — 1.294 righe per Impresa Vulcano — e il testo
 * restava indietro di due o tre lettere rispetto a quello che si digitava.
 *
 * Usato DENTRO un componente piccolo (solo il campo): così a ogni lettera si
 * ridisegna quel componente e basta. Alla pagina il valore arriva quando si
 * smette di digitare per `ritardoMs`.
 *
 * Se la pagina cambia il valore da fuori — «Azzera», un link con `?cerca=` —
 * il campo si allinea, e una scrittura ancora in attesa viene buttata: non deve
 * rimettere il testo che l'utente ha appena cancellato.
 */
export function useTestoCheSegue(
  valore: string,
  onCambia: (testo: string) => void,
  ritardoMs = 180,
): readonly [string, (testo: string) => void] {
  const [testo, setTesto] = useState(valore);
  // L'ultimo valore che il campo ha passato alla pagina: serve a distinguere
  // il ritorno del proprio valore da un cambio fatto da fuori.
  const passato = useRef(valore);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const richiama = useRef(onCambia);
  richiama.current = onCambia;

  useEffect(() => {
    if (valore === passato.current) return;
    clearTimeout(timer.current);
    passato.current = valore;
    setTesto(valore);
  }, [valore]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const scrivi = useCallback((nuovo: string) => {
    setTesto(nuovo);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      passato.current = nuovo;
      richiama.current(nuovo);
    }, ritardoMs);
  }, [ritardoMs]);

  return [testo, scrivi] as const;
}
