/**
 * I filtri di un elenco vivono nell'indirizzo, e si ricordano (26/11/2026).
 *
 * Il guasto: «cerchiamo le fatture di un fornitore, entriamo in una fattura, usciamo e la
 * ricerca è sparita, dobbiamo rifare tutto da capo». Succede perché i filtri stanno in
 * `useState`: uscire dalla pagina li butta via, e tornare la ricostruisce vuota.
 *
 * Due strade portano fuori e rientrano, e vanno coperte tutte e due:
 *   · il tasto indietro del browser — torna all'indirizzo di prima, quindi basta che i
 *     filtri siano SCRITTI nell'indirizzo mentre uno li cambia: lo fa `useURLFilters`;
 *   · il «torna all'elenco» dentro l'app, che va all'indirizzo nudo — lì serve la memoria
 *     di sessione, che fa `useOperationalViewMemory`.
 *
 * Questo hook è solo la comodità che mette insieme i due, perché la stessa sistemazione
 * serve su otto elenchi e chiamarli a mano ogni volta è lavoro ripetuto. Il motore resta
 * `useURLFilters`: in particolare è lui a tenere l'indirizzo «in costruzione», così due
 * scritture nello stesso clic si sommano invece di cancellarsi — React Router non le mette
 * in coda nemmeno nella forma a funzione.
 *
 * Quando i filtri non sono tutti stringhe semplici (numeri, interruttori, liste) si usa
 * `useURLFilters` direttamente, che ha serialize/deserialize: questo è la scorciatoia per
 * il caso comune, non un muro davanti a quello.
 */

import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useOperationalViewMemory } from "@/hooks/useOperationalViewMemory";
import { useURLFilters } from "@/hooks/useURLFilters";

export interface FiltriUrl<T extends Record<string, string>> {
  /** I valori adesso: quelli dell'indirizzo, o i predefiniti. */
  valori: T;
  /** Cambia un filtro. Tornando al predefinito, sparisce dall'indirizzo. */
  imposta: (chiave: keyof T & string, valore: string) => void;
  /** Cambia più filtri in un colpo solo. */
  impostaPiu: (cambi: Partial<Record<keyof T & string, string>>) => void;
  /**
   * Rimette tutto come appena arrivati. Non prende argomenti di proposito: si passa
   * spesso come `onClick={azzera}`, e React ci infilerebbe l'evento del clic.
   */
  azzera: () => void;
  /** Azzera e applica altri parametri insieme. */
  azzeraCon: (anche: Record<string, string>) => void;
  /** Vero se qualcosa è diverso dal predefinito: per «Azzera filtri». */
  attivi: boolean;
}

/**
 * @param ambito nome stabile dell'elenco (`ricevute`, `emesse`…): è la chiave della
 *   memoria di sessione, quindi cambiarlo fa dimenticare le scelte di chi stava lavorando.
 * @param predefiniti i filtri e il loro valore di partenza. L'oggetto può essere
 *   ricreato a ogni disegno: si guardano le chiavi e i valori, non l'identità.
 * @param ricordaAnche altri parametri che la pagina gestisce per conto suo (la ricerca con
 *   la sua attesa, la pagina, la linguetta) ma che vanno ricordati insieme agli altri.
 * @param nonRipristinare valori che si ricordano ma non si rimettono tornando all'elenco: il
 *   cestino, per esempio. Chi ci entra ci resta, e l'elenco si riaprirebbe sempre lì.
 */
export function useFiltriUrl<T extends Record<string, string>>(
  ambito: string,
  predefiniti: T,
  ricordaAnche: readonly string[] = [],
  nonRipristinare?: Record<string, readonly string[]>,
): FiltriUrl<T> {
  const [params] = useSearchParams();
  // Conta cosa contengono, non l'identità degli oggetti che la pagina ricrea a ogni giro.
  const impronta = JSON.stringify(predefiniti);
  const nomiRicordati = ricordaAnche.join("|");
  const base = useMemo(() => JSON.parse(impronta) as T, [impronta]);
  const chiavi = useMemo(() => Object.keys(base) as (keyof T & string)[], [base]);

  const definizioni = useMemo(() => {
    const d: Record<string, { key: string; defaultValue: string }> = {};
    for (const chiave of chiavi) d[chiave] = { key: chiave, defaultValue: base[chiave] };
    // Anche i parametri che la pagina gestisce da sé vanno dichiarati: `useURLFilters`
    // scrive solo le chiavi che conosce, e senza questo un «azzera e metti stato=bozza»
    // perderebbe per strada lo stato. Qui si possono scrivere; a leggerli resta la pagina.
    for (const nome of nomiRicordati ? nomiRicordati.split("|") : []) {
      if (!(nome in d)) d[nome] = { key: nome, defaultValue: "" };
    }
    // `pagina` non è un filtro, ma cambiando un filtro si riparte dalla prima: se no si
    // resta sulla pagina 7 di un elenco che adesso ne ha due, e sembra vuoto. Sta qui e
    // non fra i `valori`, perché è la pagina a dire su quale pagina è.
    d.pagina = { key: "pagina", defaultValue: "" };
    return d;
  }, [base, chiavi, nomiRicordati]);

  const { params: valoriLetti, setParams } = useURLFilters(definizioni);
  const valori = valoriLetti as unknown as T;

  const daRicordare = useMemo(() => {
    const extra = nomiRicordati ? nomiRicordati.split("|") : [];
    return [...chiavi, ...extra.filter((n) => !chiavi.includes(n as keyof T & string))];
  }, [chiavi, nomiRicordati]);
  // L'oggetto può essere ricreato a ogni disegno: il hook guarda il contenuto.
  useOperationalViewMemory(ambito, daRicordare, { nonRipristinare });

  const imposta = useCallback(
    (chiave: keyof T & string, valore: string) => setParams({ [chiave]: valore, pagina: "" }),
    [setParams],
  );
  const impostaPiu = useCallback(
    (cambi: Partial<Record<keyof T & string, string>>) => setParams({ ...cambi, pagina: "" }),
    [setParams],
  );
  const azzeraCon = useCallback(
    (anche: Record<string, string>) => setParams({ ...base, pagina: "", ...anche }),
    [setParams, base],
  );
  const azzera = useCallback(() => setParams({ ...base, pagina: "" }), [setParams, base]);

  const attivi = useMemo(
    () => chiavi.some((chiave) => (params.get(chiave) ?? base[chiave]) !== base[chiave]),
    [params, base, chiavi],
  );

  return { valori, imposta, impostaPiu, azzera, azzeraCon, attivi };
}
