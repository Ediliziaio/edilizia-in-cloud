/**
 * Chi può modificare una nota di contatto o di opportunità.
 *
 * Le note si potevano solo aggiungere: una parola sbagliata restava lì per
 * sempre (BeMade, 15/09). La regola è la stessa del database, che ha comunque
 * l'ultima parola:
 *   - l'amministratore modifica tutte le note dell'azienda;
 *   - chi ha il permesso di modificare i contatti le modifica tutte, a meno che
 *     veda solo i suoi clienti: allora le sue, e quelle importate o automatiche
 *     (senza autore) sui clienti che segue. Mai quelle di un collega.
 */

export interface NotaConAutore {
  created_by?: string | null;
}

export interface ChiModifica {
  userId: string | null | undefined;
  isAdmin: boolean;
  puoModificareContatti: boolean;
  soloAssegnati: boolean;
}

export function puoModificareNota(nota: NotaConAutore, chi: ChiModifica): boolean {
  if (chi.isAdmin) return true;
  if (!chi.puoModificareContatti) return false;
  if (!chi.soloAssegnati) return true;
  return !nota.created_by || (!!chi.userId && nota.created_by === chi.userId);
}

/** Il testo da salvare, o null se non c'è niente da salvare. */
export function testoNotaDaSalvare(originale: string, nuovo: string): string | null {
  const testo = nuovo.trim();
  if (!testo || testo === originale.trim()) return null;
  return testo;
}
