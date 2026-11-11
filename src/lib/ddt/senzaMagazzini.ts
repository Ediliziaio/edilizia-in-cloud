/**
 * Bolle per chi non ha magazzini (11/11/2026).
 *
 * Un'azienda senza magazzini riceveva le righe della bolla con destinazione
 * «Magazzino» di partenza, un selettore vuoto con scritto «Default (dal fornitore
 * o dall'ODA)» e, alla conferma, «Magazzino non disponibile o permesso mancante»
 * dal database. Qui le regole, pure, che i componenti usano:
 *   · senza magazzini la merce parte per il cantiere (la commessa della bolla, se
 *     c'è; altrimenti si sceglie);
 *   · l'errore del database diventa un'indicazione su cosa fare.
 *
 * «Senza magazzini» vuol dire: elenco caricato e vuoto. Mentre carica, o se il
 * caricamento fallisce, non si deduce niente.
 */

export type DestinazioneMerce = "cantiere" | "magazzino";

export const MESSAGGIO_SENZA_MAGAZZINI =
  "Non hai magazzini: scegli il cantiere di destinazione o crea un magazzino in Impostazioni";

export function senzaMagazzini(stato: {
  magazzini: readonly unknown[] | undefined;
  caricamento: boolean;
  errore?: unknown;
}): boolean {
  return !stato.caricamento && !stato.errore && (stato.magazzini?.length ?? 0) === 0;
}

/** La destinazione di partenza di una riga da consegnare. */
export function destinazioneRiga(opts: {
  sceltaRiga?: DestinazioneMerce;
  destinazioneBolla: DestinazioneMerce;
  nessunMagazzino: boolean;
}): DestinazioneMerce {
  if (opts.sceltaRiga) return opts.sceltaRiga;
  return opts.nessunMagazzino ? "cantiere" : opts.destinazioneBolla;
}

/**
 * La destinazione che vale davvero per una bolla nuova: «in cantiere» solo se la
 * commessa è nota (il database rifiuta il cantiere senza commessa); senza
 * magazzini, con la commessa nota, il cantiere è la scelta di partenza.
 */
export function destinazioneBollaNuova(opts: {
  scelta: DestinazioneMerce;
  sceltaToccata: boolean;
  commessaNota: boolean;
  nessunMagazzino: boolean;
}): DestinazioneMerce {
  if (!opts.commessaNota) return "magazzino";
  if (opts.nessunMagazzino && !opts.sceltaToccata) return "cantiere";
  return opts.scelta;
}

/** Il messaggio da mostrare quando la conferma della consegna non riesce. */
export function messaggioErroreConsegna(messaggio: string, nessunMagazzino: boolean): string {
  if (nessunMagazzino && /Magazzino non disponibile o permesso mancante/i.test(messaggio))
    return MESSAGGIO_SENZA_MAGAZZINI;
  return messaggio;
}
