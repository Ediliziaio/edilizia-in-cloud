/**
 * Modifica concorrente: dirlo, invece di sovrascrivere in silenzio.
 *
 * Il caso vero: due persone aprono la stessa commessa, una cambia le date e
 * salva, l'altra — che ha in pagina la versione di prima — salva il totale.
 * Il secondo salvataggio riscrive TUTTI i campi con quelli vecchi e le date del
 * collega spariscono, senza che nessuno dei due se ne accorga.
 *
 * Il rimedio non richiede nulla di nuovo sul database: si aggiunge alla UPDATE
 * la condizione "…e `updated_at` è ancora quello che avevo caricato". Se nel
 * frattempo qualcuno ha salvato, la condizione non combacia, la UPDATE tocca
 * zero righe e lo si può dire.
 *
 * Serve `.select()` sulla update: senza, PostgREST non dice quante righe ha
 * toccato e non si distingue "nessuno ha modificato niente" da "conflitto".
 */

/** Riconoscibile dal chiamante per mostrare il messaggio giusto. */
export class ConflittoModifica extends Error {
  constructor(public readonly entita: string) {
    super(
      `Questo ${entita} è stato modificato da qualcun altro mentre lo stavi `
      + `aprendo. Non ho salvato, per non cancellare le sue modifiche: ricarica `
      + `la pagina e riporta le tue.`,
    );
    this.name = "ConflittoModifica";
  }
}

export function isConflittoModifica(err: unknown): err is ConflittoModifica {
  return err instanceof ConflittoModifica;
}

/**
 * Interpreta l'esito di una UPDATE con guardia su `updated_at`.
 *
 * @param righeToccate quante righe ha restituito la `.select()` della update
 * @param entita       come chiamare la cosa nel messaggio ("commessa", "cliente")
 * @returns l'`updated_at` nuovo, da conservare per il salvataggio successivo
 * @throws ConflittoModifica se qualcun altro ha salvato nel frattempo
 */
export function esitoUpdateConGuardia(
  righeToccate: Array<{ updated_at?: string | null }> | null,
  entita: string,
): string | null {
  if (!righeToccate || righeToccate.length === 0) {
    throw new ConflittoModifica(entita);
  }
  return righeToccate[0]?.updated_at ?? null;
}
