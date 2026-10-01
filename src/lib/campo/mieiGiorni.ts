/**
 * I miei giorni su un cantiere (26/09/2026): le date del mio accesso seguono
 * le fasi e la squadra. Se ci sono decidono loro; se non ci sono (null) vale la
 * regola di prima, sulle date della commessa.
 */
export function lavoroQuelGiorno(
  mio: { dal: string | null; al: string | null } | undefined,
  giorno: string,
): boolean | null {
  if (!mio || (!mio.dal && !mio.al)) return null;
  return (!mio.dal || mio.dal <= giorno) && (!mio.al || mio.al >= giorno);
}
