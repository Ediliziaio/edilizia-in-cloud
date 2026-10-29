/**
 * Il contratto d'appalto che vale oggi.
 *
 * Un committente puo' avere piu' contratti: si rinnova ogni anno e i prezzi
 * cambiano, ma le commesse vecchie devono restare coi prezzi vecchi. Quando si
 * apre una commessa nuova serve quello in corso — e la regola di «quale e' in
 * corso» deve stare in UN posto solo, altrimenti la scheda del committente e la
 * pagina di creazione finiscono per rispondere in modo diverso (è come sono nati
 * i due parser divergenti dei decimali, luglio 2026).
 */

export interface ContrattoAppaltoMinimo {
  id: string;
  valido_dal: string;
  valido_al: string | null;
  attivo: boolean;
}

/** Oggi in formato ISO, nel fuso locale: `new Date().toISOString()` darebbe UTC. */
export function oggiISO(): string {
  return new Date().toLocaleDateString("en-CA");
}

/**
 * Il contratto in corso: fra gli attivi e validi alla data di oggi, il primo
 * dell'elenco (che arriva ordinato per `valido_dal` decrescente, quindi il piu'
 * recente). Se nessuno e' in corso ripiega sul primo attivo, e poi sul primo
 * che c'e': meglio proporre un contratto scaduto, visibile e correggibile, che
 * non proporre niente e far salvare una commessa senza listino.
 */
export function contrattoDiOggi<T extends ContrattoAppaltoMinimo>(lista: readonly T[]): T | null {
  const oggi = oggiISO();
  const inCorso = lista.filter((c) => c.attivo && c.valido_dal <= oggi && (!c.valido_al || c.valido_al >= oggi));
  return inCorso[0] ?? lista.find((c) => c.attivo) ?? lista[0] ?? null;
}
