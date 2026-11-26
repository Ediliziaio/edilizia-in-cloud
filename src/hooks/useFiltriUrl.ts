/**
 * I filtri di un elenco vivono nell'indirizzo, e si ricordano (26/11/2026).
 *
 * Il guasto: «cerchiamo le fatture di un fornitore, entriamo in una fattura, usciamo e la
 * ricerca è sparita, dobbiamo rifare tutto da capo». Succede perché i filtri stanno in
 * `useState`: uscire dalla pagina li butta via, e tornare la ricostruisce vuota.
 *
 * Due strade portano fuori e rientrano, e vanno coperte tutte e due:
 *   · il tasto indietro del browser — torna all'indirizzo di prima, quindi basta che i
 *     filtri siano SCRITTI nell'indirizzo mentre uno li cambia;
 *   · il «torna all'elenco» dentro l'app, che va all'indirizzo nudo — lì serve la memoria
 *     di sessione, che è quello che fa già `useOperationalViewMemory`.
 *
 * Questo hook mette insieme le due cose, perché la stessa sistemazione serve su otto
 * elenchi e scrivere a mano una coppia leggi/scrivi per ognuno è lavoro ripetuto.
 *
 * Un valore uguale al predefinito non viene scritto: se no ogni elenco si porterebbe
 * dietro un indirizzo lungo di «tutto=all», e un indirizzo copiato a un collega direbbe
 * cose che nessuno ha scelto.
 */

import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useOperationalViewMemory } from "@/hooks/useOperationalViewMemory";

export interface FiltriUrl<T extends Record<string, string>> {
  /** I valori adesso: quelli dell'indirizzo, o i predefiniti. */
  valori: T;
  /** Cambia un filtro. Tornando al predefinito, sparisce dall'indirizzo. */
  imposta: (chiave: keyof T & string, valore: string) => void;
  /** Cambia più filtri in un colpo solo, senza passare per due disegni. */
  impostaPiu: (cambi: Partial<Record<keyof T & string, string>>) => void;
  /**
   * Rimette tutto come appena arrivati. Non prende argomenti di proposito: si passa
   * spesso come `onClick={azzera}`, e React ci infilerebbe l'evento del clic.
   */
  azzera: () => void;
  /**
   * Azzera e applica altri parametri nella STESSA scrittura: due scritture di fila nello
   * stesso clic sono due navigazioni, e la seconda cancella la prima.
   */
  azzeraCon: (anche: Record<string, string>) => void;
  /** Vero se qualcosa è diverso dal predefinito: per «Azzera filtri». */
  attivi: boolean;
}

/**
 * @param ambito nome stabile dell'elenco (`ricevute`, `emesse`…): è la chiave della
 *   memoria di sessione, quindi cambiarlo fa dimenticare le scelte di chi stava lavorando.
 * @param predefiniti i filtri e il loro valore di partenza. L'oggetto può essere
 *   ricreato a ogni disegno: si guardano le chiavi e i valori, non l'identità.
 */
export function useFiltriUrl<T extends Record<string, string>>(
  ambito: string,
  predefiniti: T,
  /**
   * Altri parametri che la pagina gestisce per conto suo (la ricerca con la sua attesa, la
   * pagina, la linguetta) ma che vanno ricordati insieme agli altri: tornando all'elenco
   * si riprende da dov'era, non dalla prima pagina di una ricerca diversa.
   */
  ricordaAnche: readonly string[] = [],
): FiltriUrl<T> {
  const [params, setParams] = useSearchParams();
  // La pagina ricrea `predefiniti` a ogni disegno (è un oggetto letterale): si dipende dal
  // suo contenuto, non dalla sua identità, se no ogni giro rifarebbe tutto da capo.
  const impronta = JSON.stringify(predefiniti);
  const base = useMemo(() => JSON.parse(impronta) as T, [impronta]);
  const chiavi = useMemo(() => Object.keys(base) as (keyof T & string)[], [base]);

  // Come per i predefiniti: conta cosa contiene l'elenco, non l'identità dell'array che la
  // pagina ricrea a ogni disegno.
  const nomiRicordati = ricordaAnche.join("|");
  const daRicordare = useMemo(() => {
    const extra = nomiRicordati ? nomiRicordati.split("|") : [];
    return [...chiavi, ...extra.filter((n) => !chiavi.includes(n as keyof T & string))];
  }, [chiavi, nomiRicordati]);
  useOperationalViewMemory(ambito, daRicordare);

  const valori = useMemo(() => {
    const letti = {} as T;
    for (const chiave of chiavi) {
      letti[chiave] = (params.get(chiave) ?? base[chiave]) as T[keyof T & string];
    }
    return letti;
  }, [params, base, chiavi]);

  const scrivi = useCallback(
    (cambi: Partial<Record<string, string>>) => {
      setParams(
        (prima) => {
          const dopo = new URLSearchParams(prima);
          for (const [chiave, valore] of Object.entries(cambi)) {
            if (valore === undefined) continue;
            if (valore === base[chiave as keyof T & string] || valore === "") dopo.delete(chiave);
            else dopo.set(chiave, valore);
          }
          // Cambiando un filtro si riparte dalla prima pagina: se no si resta sulla
          // pagina 7 di un elenco che adesso ne ha due, e sembra vuoto.
          dopo.delete("pagina");
          return dopo;
        },
        { replace: true },
      );
    },
    [setParams, base],
  );

  const imposta = useCallback(
    (chiave: keyof T & string, valore: string) => scrivi({ [chiave]: valore }),
    [scrivi],
  );
  const impostaPiu = useCallback(
    (cambi: Partial<Record<keyof T & string, string>>) => scrivi(cambi),
    [scrivi],
  );
  const azzeraCon = useCallback(
    (anche: Record<string, string>) => scrivi({ ...base, ...anche }),
    [scrivi, base],
  );
  const azzera = useCallback(() => scrivi({ ...base }), [scrivi, base]);

  const attivi = useMemo(
    () => chiavi.some((chiave) => (params.get(chiave) ?? base[chiave]) !== base[chiave]),
    [params, base, chiavi],
  );

  return { valori, imposta, impostaPiu, azzera, azzeraCon, attivi };
}
