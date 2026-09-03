/**
 * `fetchpriority` su un'immagine, in modo che ARRIVI davvero nel DOM.
 *
 * React 18 non conosce `fetchPriority` in camelCase: lo scarta con un warning e
 * l'attributo non finisce nell'HTML. Il risultato è il contrario di quello che
 * si voleva — l'immagine che si voleva prioritaria resta a priorità normale, e
 * nessuno se ne accorge perché la pagina funziona lo stesso.
 *
 * Si scrive minuscolo, come vuole l'HTML. Lo spread serve perché i tipi JSX di
 * React 18 non dichiarano l'attributo.
 *
 * Quando si passerà a React 19, che lo accetta in camelCase, questo helper si
 * potrà togliere; restando non fa danno.
 */
export function prioritaCaricamento(valore: "high" | "low" | "auto"): Record<string, string> {
  return { fetchpriority: valore };
}
