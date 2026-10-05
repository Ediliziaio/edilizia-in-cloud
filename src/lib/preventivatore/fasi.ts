/**
 * Piccole regole della barra delle fasi del preventivatore, fuori dal componente
 * (così il file del componente esporta solo componenti: niente avvisi di HMR).
 */

/** Quanti minuti restano, a occhio: un minuto e mezzo per fase. */
export function minutiRimasti(totaleFasi: number, indiceCorrente: number): number {
  const rimaste = totaleFasi - (indiceCorrente + 1);
  return rimaste > 0 ? Math.max(1, Math.round(rimaste * 1.5)) : 0;
}

/**
 * Si può andare a una fase? Indietro sempre; avanti solo se è già stata
 * completata o è la successiva, e mai su una fase bloccata. Chi usa la barra
 * deve far passare lo scatto avanti dalla STESSA verifica del pulsante «Avanti»
 * (nel Fotovoltaico la tab «successiva» saltava quel controllo).
 */
export function faseAperta(
  indice: number,
  indiceCorrente: number,
  completata: boolean,
  bloccata: boolean,
): boolean {
  if (bloccata) return false;
  return indice <= indiceCorrente || completata || indice === indiceCorrente + 1;
}
