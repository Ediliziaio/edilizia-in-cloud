/**
 * Elenchi di id spezzati in lotti.
 *
 * Da quando «Seleziona tutti i risultati» arriva a 25.000 contatti, ogni
 * azione di massa riceve un elenco lungo, e ci sono due muri silenziosi:
 *
 *  1. `.in("id", ids)` finisce nell'URL — 25.000 uuid sono ~900 kB e la
 *     richiesta non parte nemmeno;
 *  2. PostgREST risponde al massimo con 1.000 righe, quindi un controllo del
 *     tipo «ho ritrovato tutti gli id che ho mandato» fallirebbe da solo.
 *
 * Si lavora a lotti: piccoli abbastanza da stare in un URL e sotto il tetto
 * delle mille righe, grandi abbastanza da non fare migliaia di richieste.
 */

/** Quanti id stanno comodi in un `.in(...)`: 500 uuid sono ~19 kB di URL. */
export const LOTTO_ID = 500;

/** Quante righe per insert: se un lotto fallisce, non si perde tutto. */
export const LOTTO_RIGHE = 500;

/** Spezza l'elenco in lotti della dimensione data, in ordine. */
export function aLotti<T>(elenco: readonly T[], dimensione = LOTTO_ID): T[][] {
  if (!Number.isInteger(dimensione) || dimensione < 1) {
    throw new Error("La dimensione del lotto deve essere un intero ≥ 1");
  }
  const lotti: T[][] = [];
  for (let i = 0; i < elenco.length; i += dimensione) {
    lotti.push(elenco.slice(i, i + dimensione));
  }
  return lotti;
}

/**
 * Esegue l'azione su un lotto alla volta e unisce i risultati.
 * In fila, non in parallelo: una selezione da 25.000 contatti manderebbe
 * cinquanta richieste insieme e il database le sentirebbe tutte.
 */
export async function raccogliALotti<T, R>(
  elenco: readonly T[],
  azione: (lotto: T[]) => Promise<R[]>,
  dimensione = LOTTO_ID,
): Promise<R[]> {
  const risultati: R[] = [];
  for (const lotto of aLotti(elenco, dimensione)) {
    risultati.push(...(await azione(lotto)));
  }
  return risultati;
}

/** Come sopra, quando non c'è nulla da raccogliere (update, delete, insert). */
export async function perOgniLotto<T>(
  elenco: readonly T[],
  azione: (lotto: T[]) => Promise<void>,
  dimensione = LOTTO_ID,
): Promise<void> {
  for (const lotto of aLotti(elenco, dimensione)) {
    await azione(lotto);
  }
}

/** Somma i conteggi restituiti lotto per lotto. */
export async function sommaALotti<T>(
  elenco: readonly T[],
  azione: (lotto: T[]) => Promise<number>,
  dimensione = LOTTO_ID,
): Promise<number> {
  let totale = 0;
  for (const lotto of aLotti(elenco, dimensione)) {
    totale += await azione(lotto);
  }
  return totale;
}
