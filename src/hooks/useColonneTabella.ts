/**
 * La scelta delle colonne di un elenco, ricordata per azienda (26/11/2026).
 *
 * Sta nel `localStorage`, come le due scelte di colonne che esistevano già
 * (`useColonneEmesse` per le fatture emesse, `colonneRicevute.ts` per le ricevute): è una
 * preferenza di come si guarda, non un dato dell'impresa, e metterla nel database
 * vorrebbe dire una tabella, le regole di riga e un giro di rete prima di poter disegnare
 * la tabella.
 *
 * La chiave è per persona E per azienda, come quelle due: due colleghi della stessa
 * impresa guardano cose diverse, e chi lavora su più aziende ha un'impostazione per
 * ognuna. Florin l'ha chiesta «per le aziende», ma «per l'azienda e per chi guarda» è
 * ciò che il gestionale fa già da prima, e il contrario sarebbe il collega che ti cambia
 * la tabella sotto gli occhi.
 *
 * Il prezzo da sapere: la scelta resta sul computer. Cambiando computer o browser si
 * riparte dalle predefinite. Se un giorno deve seguire la persona, la strada è una
 * tabella `preferenze_colonne` (company_id, user_id, tabella, preferenza jsonb) con le
 * regole di riga per azienda: la logica in `colonneTabella.ts` non cambia, cambia solo
 * da dove arriva `pref`.
 */

import { useCallback, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  type ColonnaTabella,
  type PreferenzaColonne,
  PREFERENZA_VUOTA,
  chiaviVisibili,
  colonneVisibili,
  conColonnaAccesa,
  conColonnaSpostata,
  preferenzaToccata,
  statoColonne,
} from "@/lib/tabelle/colonneTabella";

function chiaveSalvataggio(tabella: string, companyId: string, userId: string) {
  return `colonne-${tabella}-v1:${userId}:${companyId}`;
}

function leggi(chiave: string): PreferenzaColonne {
  try {
    const salvata = localStorage.getItem(chiave);
    if (!salvata) return PREFERENZA_VUOTA;
    const letta = JSON.parse(salvata) as Partial<PreferenzaColonne>;
    // Quello che c'è nel localStorage l'ha scritto una versione passata di noi: si legge
    // con diffidenza, perché una forma sbagliata qui spegnerebbe la tabella.
    return {
      ordine: Array.isArray(letta?.ordine) ? letta.ordine.filter((k) => typeof k === "string") : [],
      nascoste: Array.isArray(letta?.nascoste) ? letta.nascoste.filter((k) => typeof k === "string") : [],
    };
  } catch {
    return PREFERENZA_VUOTA;
  }
}

/**
 * Come leggere una preferenza scritta da una versione precedente, con una chiave e una
 * forma diverse. Serve una volta sola: letta, viene riscritta nella forma nuova e la
 * vecchia chiave non si guarda più.
 */
function leggiOTraduci(
  chiave: string,
  vecchiaChiave?: string,
  traduci?: TraduciPreferenza,
): PreferenzaColonne {
  try {
    if (localStorage.getItem(chiave) !== null) return leggi(chiave);
    if (!vecchiaChiave || !traduci) return PREFERENZA_VUOTA;
    const prima = localStorage.getItem(vecchiaChiave);
    if (prima === null) return PREFERENZA_VUOTA;
    const tradotta = traduci(JSON.parse(prima));
    if (!tradotta) return PREFERENZA_VUOTA;
    // Si riscrive subito nella forma nuova: così la traduzione avviene una volta e la
    // scelta non dipende più da come la scriveva la versione di prima.
    localStorage.setItem(chiave, JSON.stringify(tradotta));
    return tradotta;
  } catch {
    return PREFERENZA_VUOTA;
  }
}

/**
 * Da quello che c'era scritto nella chiave vecchia alla preferenza nuova; `null` se non si
 * capisce. Va dichiarata fuori dal componente: il hook la tiene fra le dipendenze, e una
 * funzione ricreata a ogni render farebbe ripartire la lettura in continuazione.
 */
export type TraduciPreferenza = (letta: unknown) => PreferenzaColonne | null;

export interface ColonneTabella {
  /** Le colonne da disegnare, nell'ordine giusto. */
  colonne: ColonnaTabella[];
  /** Le chiavi visibili: per i `{visibili.has("cig") && <TableCell …>}` dentro la riga. */
  visibili: Set<string>;
  /** Come sta ogni colonna adesso: lo mangia `SceltaColonne`. */
  stato: { colonna: ColonnaTabella; accesa: boolean }[];
  accendi: (chiave: string, accesa: boolean) => void;
  sposta: (chiave: string, a: number) => void;
  ripristina: () => void;
  /** Vera se l'azienda ha cambiato qualcosa: «Ripristina predefinite» si offre solo allora. */
  toccata: boolean;
}

/**
 * @param tabella nome stabile dell'elenco (`fatture_emesse`, `scadenzario`…): entra nella
 *   chiave salvata, quindi non si rinomina senza buttare via le scelte delle aziende.
 * @param def le colonne della pagina, nell'ordine di serie.
 */
export function useColonneTabella(
  tabella: string,
  def: ColonnaTabella[],
  /** La chiave con cui una versione precedente salvava la stessa scelta, se c'era. */
  vecchiaChiave?: string,
  /** Come leggerla. Dichiarata fuori dal componente, quindi stabile. */
  traduci?: TraduciPreferenza,
): ColonneTabella {
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id || "nessuna";
  const userId = user?.id || "sessione";
  const chiave = chiaveSalvataggio(tabella, companyId, userId);

  // La preferenza viaggia insieme alla chiave con cui è stata letta. Cambiando azienda (i
  // superadmin lo fanno continuamente) o persona, la chiave non combacia più e si rilegge
  // subito quella giusta: senza questo la tabella resterebbe con le colonne di prima. Si fa
  // così e non con un effetto, perché un effetto che chiama setState fa un secondo giro di
  // disegno e per un istante si vedrebbero le colonne sbagliate.
  const [salvato, setSalvato] = useState<{ chiave: string; pref: PreferenzaColonne }>(() => ({
    chiave,
    pref: leggiOTraduci(chiave, vecchiaChiave, traduci),
  }));
  const pref =
    salvato.chiave === chiave ? salvato.pref : leggiOTraduci(chiave, vecchiaChiave, traduci);

  const salva = useCallback(
    (nuova: PreferenzaColonne) => {
      setSalvato({ chiave, pref: nuova });
      try {
        localStorage.setItem(chiave, JSON.stringify(nuova));
      } catch {
        /* Safari in navigazione privata: la scelta vale per questa visita */
      }
    },
    [chiave],
  );

  const accendi = useCallback(
    (k: string, accesa: boolean) => salva(conColonnaAccesa(def, pref, k, accesa)),
    [def, pref, salva],
  );

  const sposta = useCallback(
    (k: string, a: number) => salva(conColonnaSpostata(def, pref, k, a)),
    [def, pref, salva],
  );

  const ripristina = useCallback(() => {
    setSalvato({ chiave, pref: PREFERENZA_VUOTA });
    try {
      localStorage.removeItem(chiave);
    } catch {
      /* come sopra */
    }
  }, [chiave]);

  return useMemo(
    () => ({
      colonne: colonneVisibili(def, pref),
      visibili: chiaviVisibili(def, pref),
      stato: statoColonne(def, pref),
      accendi,
      sposta,
      ripristina,
      toccata: preferenzaToccata(pref),
    }),
    [def, pref, accendi, sposta, ripristina],
  );
}
