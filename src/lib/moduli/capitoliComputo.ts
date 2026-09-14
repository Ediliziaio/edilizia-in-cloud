/**
 * Capitoli del computo negli otto moduli di preventivo.
 *
 * Il capitolo non ha un id: è il nome scritto sulle voci. Rinominarlo a ogni
 * tasto spostava le voci in «Generale» (campo vuoto a metà digitazione) o le
 * fondeva con un capitolo omonimo; e le sezioni erano chiavate per posizione,
 * così eliminarne una passava lo stato (aperta, nome in scrittura) alla dopo.
 */

export type EsitoRinomina =
  | { tipo: "invariato" }
  | { tipo: "vuoto" }
  | { tipo: "doppione"; nome: string }
  | { tipo: "rinomina"; nome: string };

const confrontabile = (nome: string) => nome.trim().toLocaleLowerCase("it-IT");

/**
 * Cosa fare del nome scritto per un capitolo. Vuoto o uguale: resta quello di
 * prima. Già di un altro capitolo (maiuscole a parte): si rifiuta, perché le
 * voci dei due capitoli si fonderebbero.
 */
export function esitoRinomina(
  vecchio: string,
  scritto: string,
  nomiCapitoli: readonly string[],
): EsitoRinomina {
  const nome = scritto.trim();
  if (!nome) return { tipo: "vuoto" };
  if (nome === vecchio) return { tipo: "invariato" };
  const cercato = confrontabile(nome);
  const doppione = nomiCapitoli.some((altro) => altro !== vecchio && confrontabile(altro) === cercato);
  return doppione ? { tipo: "doppione", nome } : { tipo: "rinomina", nome };
}

/**
 * Chiavi React dei capitoli, nell'ordine dato. Un capitolo rinominato tiene la
 * chiave che aveva (`ereditate`); gli altri la ricavano dal nome, con un
 * suffisso se quella chiave è già presa da un capitolo rinominato.
 */
export function chiaviCapitoli(
  nomi: readonly string[],
  ereditate: ReadonlyMap<string, string>,
): string[] {
  const prese = new Set(ereditate.values());
  return nomi.map((nome) => {
    const ereditata = ereditate.get(nome);
    if (ereditata) return ereditata;
    let chiave = `cap:${nome}`;
    for (let n = 2; prese.has(chiave); n += 1) chiave = `cap:${nome}#${n}`;
    prese.add(chiave);
    return chiave;
  });
}

/** Passa la chiave del capitolo `vecchio` al suo nome `nuovo`. */
export function passaChiave(
  ereditate: ReadonlyMap<string, string>,
  vecchio: string,
  nuovo: string,
  chiave: string,
): Map<string, string> {
  const aggiornate = new Map(ereditate);
  aggiornate.delete(vecchio);
  aggiornate.set(nuovo, chiave);
  return aggiornate;
}
