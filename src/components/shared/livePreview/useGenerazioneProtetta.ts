/**
 * useGenerazioneProtetta — genera l'anteprima con debounce, timeout e messaggio
 * d'errore leggibile.
 *
 * Perché esiste: @react-pdf scarica le immagini remote del template (logo,
 * copertina, foto) SENZA timeout interno — se una non risponde, `toBlob()` non
 * si risolve MAI e l'anteprima gira a vuoto per sempre. Questa protezione era
 * stata scritta SOLO nel dialog Serramenti; il pannello live condiviso da tutti
 * gli altri vertical ne era privo. Mettendola qui, ogni pannello la eredita.
 *
 * Gestisce anche la corsa tra generazioni: se l'utente continua a digitare,
 * solo l'ultima vince e le precedenti vengono scartate (con revoca del blob,
 * niente memory leak).
 */
import { useCallback, useEffect, useRef, useState } from "react";

/** Oltre questo tempo la generazione è persa: meglio dirlo che girare a vuoto. */
export const TIMEOUT_ANTEPRIMA_MS = 45_000;

export const MESSAGGIO_TIMEOUT =
  "L'anteprima non si è generata in tempo. Di solito è un'immagine del template " +
  "(logo, copertina o foto) che non si carica: prova a ricaricarla o sostituirla.";

export interface GenerazioneProtetta<T> {
  risultato: T | null;
  caricamento: boolean;
  errore: string | null;
  rigenera: () => void;
}

/**
 * @param genera funzione che produce il risultato (es. un blob URL)
 * @param depsKey stringa che rappresenta lo stato: quando cambia, rigenera
 * @param opts.abilitato genera solo quando true (es. template caricato)
 * @param opts.onScarta chiamata sui risultati scartati (per revocare i blob URL)
 */
export function useGenerazioneProtetta<T>(
  genera: () => Promise<T>,
  depsKey: string,
  opts: {
    abilitato?: boolean;
    debounceMs?: number;
    timeoutMs?: number;
    onScarta?: (risultato: T) => void;
  } = {},
): GenerazioneProtetta<T> {
  const { abilitato = true, debounceMs = 500, timeoutMs = TIMEOUT_ANTEPRIMA_MS, onScarta } = opts;

  const [risultato, setRisultato] = useState<T | null>(null);
  const [caricamento, setCaricamento] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  // Ref per le funzioni: cambiano identità ad ogni render del parent, ma
  // l'effetto deve dipendere SOLO da depsKey (altrimenti si rigenera all'infinito).
  const generaRef = useRef(genera);
  generaRef.current = genera;
  const onScartaRef = useRef(onScarta);
  onScartaRef.current = onScarta;

  const correnteRef = useRef<T | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generazioneRef = useRef(0);

  const esegui = useCallback(() => {
    const mia = ++generazioneRef.current;
    setCaricamento(true);
    setErrore(null);
    void (async () => {
      // Fino a 3 tentativi. Un fallimento TRANSITORIO — tipico il chunk JS di
      // @react-pdf non ancora online durante/subito dopo un deploy, che rifiuta
      // l'import con «Failed to fetch» — si risolve da solo al giro dopo: prima
      // bastava un attimo di sfortuna sul timing del deploy per lasciare
      // l'anteprima rotta su TUTTI i vertical. Il TIMEOUT invece NON si ritenta:
      // lì un'immagine del template resta appesa e riprovare vuol dire aspettare
      // altri 45 secondi a vuoto.
      const TENTATIVI = 3;
      let ultimoErrore: unknown = null;
      for (let tentativo = 1; tentativo <= TENTATIVI; tentativo++) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const esito = await Promise.race([
            generaRef.current(),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error(MESSAGGIO_TIMEOUT)), timeoutMs);
            }),
          ]);
          if (timer) clearTimeout(timer);
          // Arrivata in ritardo: l'utente ha già modificato altro → si scarta.
          if (mia !== generazioneRef.current) {
            onScartaRef.current?.(esito);
            return;
          }
          if (correnteRef.current != null) onScartaRef.current?.(correnteRef.current);
          correnteRef.current = esito;
          setRisultato(esito);
          setCaricamento(false);
          return;
        } catch (e) {
          if (timer) clearTimeout(timer);
          ultimoErrore = e;
          // Una generazione più nuova è partita: molla senza toccare lo stato.
          if (mia !== generazioneRef.current) return;
          const eTimeout = e instanceof Error && e.message === MESSAGGIO_TIMEOUT;
          if (eTimeout || tentativo === TENTATIVI) break;
          await new Promise((r) => setTimeout(r, 400 * tentativo));
          if (mia !== generazioneRef.current) return;
        }
      }
      // Tentativi esauriti (o timeout): messaggio a schermo, dettaglio in console.
      console.error("[anteprima] generazione fallita:", ultimoErrore);
      if (mia === generazioneRef.current) {
        setErrore(ultimoErrore instanceof Error ? ultimoErrore.message : "Errore nella generazione dell'anteprima");
        setCaricamento(false);
      }
    })();
  }, [timeoutMs]);

  useEffect(() => {
    if (!abilitato) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(esegui, debounceMs);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [depsKey, abilitato, debounceMs, esegui]);

  // Smontaggio: libera l'ultimo risultato (i blob URL restano in memoria finché
  // non vengono revocati esplicitamente).
  useEffect(() => () => {
    if (correnteRef.current != null) {
      onScartaRef.current?.(correnteRef.current);
      correnteRef.current = null;
    }
  }, []);

  const rigenera = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    esegui();
  }, [esegui]);

  return { risultato, caricamento, errore, rigenera };
}
